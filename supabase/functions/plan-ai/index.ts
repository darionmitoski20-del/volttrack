// VoltTrack — plan-ai edge function
//
// Reads electrical drawing sets with AI.
//   action "start"     (owner)  : sends the plan PDF to the AI in the background and
//                                 stores a running report row (plan_ai_pages, page 0)
//   action "poll"      (member) : checks the background job and saves the finished report
//   action "ask"       (member) : asks a question about the plan (background)
//   action "poll_ask"  (member) : checks a question and saves the answer
//   no action, images  (owner)  : reads legend / schedule page images (returns JSON)
//
// Deploy via the Supabase Dashboard: Edge Functions -> plan-ai -> Code -> paste -> Deploy.
// "Verify JWT with legacy secret" must be OFF (this function checks the user itself).
//
// Secrets (Edge Functions -> Secrets), at least one key:
//   OPENAI_API_KEY      - platform.openai.com (runs in the background, best for big PDFs)
//   ANTHROPIC_API_KEY   - console.anthropic.com
//   AI_PROVIDER         - optional, "openai" or "anthropic" when both keys are set
//   OPENAI_MODEL        - optional, tried first
//   ANTHROPIC_MODEL     - optional, default claude-opus-5-5
//   PLAN_AI_DAILY       - optional, plan reports per company per 24 h (default 20)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const PROVIDER = Deno.env.get('AI_PROVIDER') ?? (OPENAI_KEY ? 'openai' : ANTHROPIC_KEY ? 'anthropic' : '');
// Strongest first; a model the account cannot use is skipped.
const OPENAI_MODELS = [Deno.env.get('OPENAI_MODEL'), 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.5', 'gpt-5', 'gpt-4.1']
  .filter(Boolean) as string[];
const CLAUDE_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5-5';
// Models the owner may pick when reading a plan (to compare quality and price).
const PICKABLE = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna'];
const DAILY = Number(Deno.env.get('PLAN_AI_DAILY') ?? '20');
const DAILY_Q = 60;
const MAX_PDF = 32 * 1024 * 1024; // OpenAI / Claude file limit

const REPORT_PROMPT = `You are a senior US electrical estimator working for an ELECTRICAL contractor. The attached file
(or text) is ONE construction drawing set. Read EVERY sheet. Electrical work is the priority and must be complete and exact;
other trades (mechanical, plumbing, etc.) are listed separately. Return ONLY a JSON object, in English, with exactly this shape
(use [] or null when something is not in the set; never invent data; prefix uncertain item names with "~"):

{
  "project": { "name": "", "address": "", "owner": "", "architect": "", "engineer": "", "issue_date": "" },
  "scope": "2-3 short sentences: the electrical work",
  "sheets": [ { "number": "E.2.0", "title": "", "discipline": "Electrical" } ],
  "electrical": {
    "floors": [ { "name": "First floor",
                  "totals": [ { "category": "Lighting | Switches & controls | Receptacles | Data & low voltage | Equipment & connections | Other",
                                "item": "short name, e.g. Duplex receptacle 20A TR", "count": 10 } ],
                  "rooms": [ { "room": "117 BOE Office", "items": [ { "item": "", "count": 1 } ] } ] } ],
    "lighting": [ { "type": "A", "description": "short", "manufacturer": "", "catalog": "", "watts": "", "mounting": "", "count": 0, "emergency_count": 0 } ],
    "panels": [ { "name": "", "status": "new | existing | modified", "voltage": "", "main": "", "location": "", "fed_from": "", "feeder": "",
                  "circuits": [ { "ckt": "", "description": "", "breaker": "", "wire": "" } ] } ],
    "materials": [ { "category": "Boxes | Plates | Devices | Fixtures | Wire | Conduit | Fittings | Breakers & panels | Supports | Other",
                     "item": "", "quantity": 0, "unit": "ea | ft", "basis": "short" } ],
    "demolition": [ "short" ]
  },
  "fire_alarm": { "summary": "", "floors": [ { "name": "", "devices": [ { "item": "", "count": 0 } ] } ], "notes": [ "short" ] },
  "other_trades": [ { "name": "Mechanical | Plumbing | Architectural | ...", "summary": "1-2 sentences",
                      "equipment": [ { "tag": "AC-1", "description": "", "location": "", "power": "what the electrician must provide, e.g. 30AS/15AT/2P disconnect, RLP-30,32; or 'not shown on E sheets'" } ],
                      "notes": [ "short" ] } ],
  "risks": [ "short" ],
  "rfi": [ "ready-to-send question" ],
  "changes": [ "short" ]
}

Rules: count only NEW electrical work shown on floor plans (not legends, schedules, existing-to-remain or demolition).
Count every floor separately and every room on it. Low voltage / data belongs to electrical. Mechanical and plumbing
equipment that needs power is listed under other_trades with what the electrician must provide; flag equipment on M/P sheets
that has no electrical connection on the E sheets. Keep texts short. Panels: every circuit in the schedules.`;

const IMAGE_PROMPT = `These images are tiles (left-to-right, top-to-bottom) of ONE sheet from a US electrical
construction drawing set. Read every legend, schedule and note on it and return ONLY a JSON object,
no other text, with this shape (use [] when a section is not on the sheet, never invent data):
{ "sheet": "", "legend": [ { "tag": "", "description": "" } ],
  "fixtures": [ { "type": "", "description": "", "manufacturer": "", "catalog": "", "lamp": "", "voltage": "", "watts": "", "mounting": "", "notes": "" } ],
  "panels": [ { "name": "", "voltage": "", "main": "", "location": "", "circuits": [ { "ckt": "", "description": "", "breaker": "" } ] } ],
  "notes": [ "" ] }`;

const QA_PROMPT = `Answer the question about the attached electrical drawing set for an electrical contractor.
Be specific and short. Mention sheet numbers and rooms. If the drawings do not say, say so.
Answer in the same language as the question.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function parseJson(answer: string): unknown {
  const m = answer.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(m ? m[0] : answer);
  } catch {
    return { scope: answer.slice(0, 4000) };
  }
}

function modelProblem(status: number, msg: string, code: string) {
  return status === 404 || code === 'model_not_found' ||
    (/model/i.test(msg) && /(not exist|not found|no access|do not have access|not available|unsupported|not supported)/i.test(msg));
}

// ---- OpenAI ------------------------------------------------------------------------

async function openaiUpload(blob: Blob, name: string): Promise<string> {
  const fd = new FormData();
  fd.append('purpose', 'user_data');
  fd.append('file', new File([blob], name, { type: 'application/pdf' }));
  const r = await fetch('https://api.openai.com/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: fd });
  const out = await r.json();
  if (!r.ok) throw new Error(`OpenAI file upload: ${out?.error?.message ?? r.status}`);
  return out.id;
}

// deno-lint-ignore no-explicit-any
async function openaiStart(content: any[], asJson: boolean, prefer?: string): Promise<{ id: string; model: string }> {
  let last = '';
  for (const model of prefer ? [prefer] : OPENAI_MODELS) {
    const body: Record<string, unknown> = {
      model,
      background: true,
      input: [{ role: 'user', content }],
      max_output_tokens: 60000,
    };
    if (asJson) body.text = { format: { type: 'json_object' } };
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await r.json();
    if (r.ok) return { id: out.id, model };
    last = out?.error?.message ?? `status ${r.status}`;
    if (!modelProblem(r.status, last, String(out?.error?.code ?? ''))) break;
  }
  throw new Error(`OpenAI: ${last}`);
}

// deno-lint-ignore no-explicit-any
async function openaiGet(id: string): Promise<any> {
  const r = await fetch(`https://api.openai.com/v1/responses/${id}`, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } });
  const out = await r.json();
  if (!r.ok) throw new Error(`OpenAI: ${out?.error?.message ?? r.status}`);
  return out;
}

// deno-lint-ignore no-explicit-any
function openaiText(out: any): string {
  if (typeof out.output_text === 'string') return out.output_text;
  // deno-lint-ignore no-explicit-any
  return (out.output ?? []).flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
}

// ---- Claude (answers right away) ----------------------------------------------------

// deno-lint-ignore no-explicit-any
async function claude(content: any[], maxTokens: number): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(`Claude: ${out?.error?.message ?? r.status}`);
  // deno-lint-ignore no-explicit-any
  return (out.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
}

// Claude in the background: a one-request Message Batch (no time limit, half price).
// deno-lint-ignore no-explicit-any
async function claudeBatchStart(model: string, content: any[], maxTokens: number): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ custom_id: 'plan', params: { model, max_tokens: maxTokens, messages: [{ role: 'user', content }] } }] }),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(`Claude: ${out?.error?.message ?? r.status}`);
  return out.id;
}

/** null while running; text when done; throws when the request failed. */
async function claudeBatchGet(id: string): Promise<string | null> {
  const h = { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' };
  const r = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers: h });
  const out = await r.json();
  if (!r.ok) throw new Error(`Claude: ${out?.error?.message ?? r.status}`);
  if (out.processing_status !== 'ended') return null;
  const res = await fetch(out.results_url, { headers: h });
  const lines = (await res.text()).split('\n').filter(Boolean);
  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.result?.type === 'succeeded') {
      // deno-lint-ignore no-explicit-any
      return (item.result.message?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    }
    throw new Error(`Claude: ${item.result?.error?.error?.message ?? item.result?.error?.message ?? item.result?.type ?? 'failed'}`);
  }
  throw new Error('Claude: empty result');
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---- handler ------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: 'Not signed in' }, 401);
    const admin = createClient(SB_URL, SB_SERVICE);

    const body = await req.json();
    const { company_id } = body;
    const { data: member } = await admin
      .from('company_members')
      .select('role')
      .eq('company_id', company_id)
      .eq('user_id', u.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!member) return json({ error: 'Not a member of this company' }, 403);
    const isOwner = member.role === 'owner';
    if (!PROVIDER) return json({ error: 'No AI key is set on the server (OPENAI_API_KEY or ANTHROPIC_API_KEY)' }, 500);
    const action = body.action ?? 'images';
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // ---------------------------------------------------------------- start a plan report
    if (action === 'start') {
      if (!isOwner) return json({ error: 'Only the owner can start AI reading' }, 403);
      const picked = typeof body.model === 'string' && PICKABLE.includes(body.model) ? body.model : null;
      const useClaude = picked ? picked.startsWith('claude') : PROVIDER === 'anthropic';
      if (useClaude && !ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set on the server' }, 500);
      if (!useClaude && !OPENAI_KEY) return json({ error: 'OPENAI_API_KEY is not set on the server' }, 500);
      const { version_id, text } = body;
      const { data: v } = await admin.from('plan_versions').select('id, n, job_site_id, company_id, pdf_path, file_name').eq('id', version_id).maybeSingle();
      if (!v || v.company_id !== company_id) return json({ error: 'Plan version not found' }, 404);

      const { count } = await admin.from('plan_ai_pages').select('id', { count: 'exact', head: true })
        .eq('company_id', company_id).eq('page', 0).gte('created_at', since);
      if ((count ?? 0) >= DAILY) return json({ error: `Daily AI limit reached (${DAILY} plans). Try again tomorrow.` }, 429);

      // The previous version's report, so the AI can list what changed.
      const { data: prevV } = await admin.from('plan_versions').select('id').eq('job_site_id', v.job_site_id)
        .eq('status', 'done').lt('n', v.n).order('n', { ascending: false }).limit(1).maybeSingle();
      let prevReport = '';
      if (prevV) {
        const { data: pr } = await admin.from('plan_ai_pages').select('result').eq('version_id', prevV.id).eq('page', 0).eq('status', 'done').maybeSingle();
        if (pr?.result) prevReport = JSON.stringify(pr.result).slice(0, 80000);
      }
      const prompt = REPORT_PROMPT + (prevReport
        ? `\n\nThis is a REVISION. Report of the previous version (JSON) is below. Fill "changes" with what is added, removed or different:\n${prevReport}`
        : '\n\nThis is the first version: return "changes": [].');

      // Which PDF the AI reads: the electrical subset made at upload (ai.pdf), else the stored original.
      let pdf: Blob | null = null;
      const candidates = [
        typeof body.ai_pdf_path === 'string' && body.ai_pdf_path.startsWith(`${company_id}/`) ? body.ai_pdf_path : null,
        `${company_id}/${v.job_site_id}/v${v.n}/ai.pdf`,
        v.pdf_path,
      ].filter(Boolean) as string[];
      for (const path of candidates) {
        const { data: dl } = await admin.storage.from('plans').download(path);
        if (dl && dl.size <= MAX_PDF) { pdf = dl; break; }
      }
      const planText = typeof text === 'string' ? text.slice(0, 400000) : '';
      if (!pdf && !planText) return json({ error: 'No PDF or text to read' }, 400);

      await admin.from('plan_ai_pages').delete().eq('version_id', version_id).eq('page', 0);
      const row = {
        company_id, job_site_id: v.job_site_id, version_id, page: 0, title: 'Plan report',
        created_by: u.user.id, updated_at: new Date().toISOString(),
      };

      if (!useClaude) {
        // deno-lint-ignore no-explicit-any
        const content: any[] = [];
        let fileId: string | null = null;
        if (pdf) {
          fileId = await openaiUpload(pdf, v.file_name || 'plan.pdf');
          content.push({ type: 'input_file', file_id: fileId });
        } else {
          content.push({ type: 'input_text', text: `DRAWING SET TEXT (the PDF was too large to attach):\n${planText}` });
        }
        content.push({ type: 'input_text', text: prompt });
        const job = await openaiStart(content, true, picked ?? undefined);
        await admin.from('plan_ai_pages').insert({ ...row, status: 'running', job_id: job.id, file_id: fileId, result: { model: job.model } });
        return json({ status: 'running' });
      }

      // Claude: one-request batch, read in the background.
      const model = picked ?? CLAUDE_MODEL;
      // deno-lint-ignore no-explicit-any
      const content: any[] = pdf
        ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(await pdf.arrayBuffer()) } }]
        : [{ type: 'text', text: `DRAWING SET TEXT:\n${planText}` }];
      content.push({ type: 'text', text: prompt });
      const batchId = await claudeBatchStart(model, content, 64000);
      await admin.from('plan_ai_pages').insert({ ...row, status: 'running', job_id: `claude:${batchId}`, result: { model } });
      return json({ status: 'running' });
    }

    // ---------------------------------------------------------------- check a plan report
    if (action === 'poll') {
      const { version_id } = body;
      const { data: row } = await admin.from('plan_ai_pages').select('*').eq('version_id', version_id).eq('page', 0)
        .eq('company_id', company_id).maybeSingle();
      if (!row) return json({ status: 'none' });
      if (row.status !== 'running' || !row.job_id) return json({ status: row.status, error: row.error });
      if (row.job_id.startsWith('claude:')) {
        const model = (row.result as { model?: string })?.model ?? CLAUDE_MODEL;
        try {
          const answer = await claudeBatchGet(row.job_id.slice(7));
          if (answer === null) return json({ status: 'running' });
          const result = { ...(parseJson(answer) as object), model };
          await admin.from('plan_ai_pages').update({ status: 'done', result, updated_at: new Date().toISOString() }).eq('id', row.id);
          return json({ status: 'done' });
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          await admin.from('plan_ai_pages').update({ status: 'error', error: err, updated_at: new Date().toISOString() }).eq('id', row.id);
          return json({ status: 'error', error: err });
        }
      }
      const out = await openaiGet(row.job_id);
      if (out.status === 'completed') {
        const result = { ...(parseJson(openaiText(out)) as object), model: out.model };
        await admin.from('plan_ai_pages').update({ status: 'done', result, updated_at: new Date().toISOString() }).eq('id', row.id);
        return json({ status: 'done' });
      }
      if (['failed', 'cancelled', 'incomplete'].includes(out.status)) {
        const err = out.error?.message ?? out.incomplete_details?.reason ?? out.status;
        // An answer cut short can still hold a usable report.
        const partial = out.status === 'incomplete' ? openaiText(out) : '';
        await admin.from('plan_ai_pages').update({
          status: partial ? 'done' : 'error',
          error: partial ? `Report may be incomplete (${err})` : String(err),
          result: partial ? { ...(parseJson(partial) as object), model: out.model } : row.result,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        return json({ status: partial ? 'done' : 'error', error: err });
      }
      return json({ status: 'running' });
    }

    // ---------------------------------------------------------------- ask about the plan
    if (action === 'ask') {
      const { version_id, question } = body;
      const q = String(question ?? '').trim().slice(0, 2000);
      if (!q) return json({ error: 'Empty question' }, 400);
      const { count } = await admin.from('plan_ai_questions').select('id', { count: 'exact', head: true })
        .eq('company_id', company_id).gte('created_at', since);
      if ((count ?? 0) >= DAILY_Q) return json({ error: `Daily question limit reached (${DAILY_Q}).` }, 429);
      const { data: rep } = await admin.from('plan_ai_pages').select('job_site_id, file_id, result').eq('version_id', version_id)
        .eq('page', 0).eq('company_id', company_id).maybeSingle();
      if (!rep) return json({ error: 'Read the plan with AI first' }, 400);
      const context = `REPORT OF THIS PLAN (JSON):\n${JSON.stringify(rep.result).slice(0, 120000)}`;
      const base = { company_id, job_site_id: rep.job_site_id, version_id, user_id: u.user.id, question: q };

      if (PROVIDER === 'openai') {
        // deno-lint-ignore no-explicit-any
        const content: any[] = [];
        if (rep.file_id) content.push({ type: 'input_file', file_id: rep.file_id });
        content.push({ type: 'input_text', text: `${QA_PROMPT}\n\n${context}\n\nQUESTION: ${q}` });
        const job = await openaiStart(content, false);
        const { data: ins } = await admin.from('plan_ai_questions').insert({ ...base, status: 'running', job_id: job.id }).select('id').single();
        return json({ id: ins?.id, status: 'running' });
      }
      const answer = await claude([{ type: 'text', text: `${QA_PROMPT}\n\n${context}\n\nQUESTION: ${q}` }], 4000);
      const { data: ins } = await admin.from('plan_ai_questions').insert({ ...base, status: 'done', answer }).select('id').single();
      return json({ id: ins?.id, status: 'done' });
    }

    if (action === 'poll_ask') {
      const { data: q } = await admin.from('plan_ai_questions').select('*').eq('id', body.question_id).eq('company_id', company_id).maybeSingle();
      if (!q) return json({ status: 'none' });
      if (q.status !== 'running' || !q.job_id || PROVIDER !== 'openai') return json({ status: q.status });
      const out = await openaiGet(q.job_id);
      if (out.status === 'completed' || out.status === 'incomplete') {
        await admin.from('plan_ai_questions').update({ status: 'done', answer: openaiText(out) || '(no answer)' }).eq('id', q.id);
        return json({ status: 'done' });
      }
      if (['failed', 'cancelled'].includes(out.status)) {
        await admin.from('plan_ai_questions').update({ status: 'error', answer: out.error?.message ?? out.status }).eq('id', q.id);
        return json({ status: 'error' });
      }
      return json({ status: 'running' });
    }

    // ---------------------------------------------------------------- legend / schedule images
    if (!isOwner) return json({ error: 'Only the owner can use AI reading' }, 403);
    const { images } = body;
    if (!Array.isArray(images) || images.length < 1 || images.length > 8) return json({ error: 'Send 1 to 8 images' }, 400);
    const { count } = await admin.from('plan_ai_pages').select('id', { count: 'exact', head: true })
      .eq('company_id', company_id).gte('created_at', since);
    if ((count ?? 0) >= DAILY * 3) return json({ error: 'Daily AI limit reached. Try again tomorrow.' }, 429);
    let answer = '';
    if (PROVIDER === 'openai') {
      const content = [
        ...images.map((b: string) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${b}`, detail: 'high' })),
        { type: 'input_text', text: IMAGE_PROMPT },
      ];
      const job = await openaiStart(content, true);
      // Small request: wait for it here (up to ~2 minutes).
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const out = await openaiGet(job.id);
        if (out.status === 'completed' || out.status === 'incomplete') { answer = openaiText(out); break; }
        if (['failed', 'cancelled'].includes(out.status)) throw new Error(out.error?.message ?? out.status);
      }
      if (!answer) return json({ error: 'AI took too long, try fewer pages' }, 504);
    } else {
      answer = await claude([
        ...images.map((b: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } })),
        { type: 'text', text: IMAGE_PROMPT },
      ], 16000);
    }
    return json({ result: parseJson(answer) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
