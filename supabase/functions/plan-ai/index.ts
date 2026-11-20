// VoltTrack — plan-ai edge function
//
// Reads legend / schedule pages of an electrical plan with Claude and returns
// structured JSON (symbol legend, light fixture schedule, panel schedules, notes).
//
// Deploy via the Supabase Dashboard: Edge Functions -> Deploy a new function ->
// Via Editor -> name it "plan-ai" -> paste this file. Keep "Verify JWT" ON.
//
// Required secret (Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY  - from console.anthropic.com
// Optional:
//   ANTHROPIC_MODEL    - defaults to claude-sonnet-5-5
//   PLAN_AI_DAILY_PAGES - pages per company per 24 h (default 30)
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
const DAILY = Number(Deno.env.get('PLAN_AI_DAILY_PAGES') ?? '30');

const PROMPT = `These images are tiles (left-to-right, top-to-bottom) of ONE sheet from a US electrical
construction drawing set. Read every legend, schedule and note on it and return ONLY a JSON object,
no other text, with this shape (use [] when a section is not on the sheet, never invent data):

{
  "sheet": "sheet number and title as printed, e.g. E0.01 ELECTRICAL SYMBOLS AND LEGEND",
  "legend": [ { "tag": "symbol tag or abbreviation if any, e.g. GFI, WP, OS", "description": "what the symbol means" } ],
  "fixtures": [ { "type": "fixture type mark, e.g. L1 or A", "description": "", "manufacturer": "", "catalog": "", "lamp": "lamp / LED / lumens", "voltage": "", "watts": "", "mounting": "", "notes": "" } ],
  "panels": [ { "name": "panel name", "voltage": "e.g. 208Y/120V 3PH 4W", "main": "main breaker / MLO and amps", "location": "", "circuits": [ { "ckt": "circuit number", "description": "load", "breaker": "e.g. 20/1" } ] } ],
  "notes": [ "important general or keyed notes for the electrician, short" ]
}

Copy text exactly as printed. Keep descriptions short. If text is unreadable, leave the field "".`;

const SUMMARY_PROMPT = `You are an experienced US electrical estimator. Below is the TEXT of every page of one
electrical drawing set (extracted from the PDF), plus counts of short tags found on each page (fixture
type marks, sensor tags, etc.). Write a project briefing for the electrical contractor.

Write ALL values in Macedonian (Cyrillic script). Keep technical terms, model numbers, panel names and
sheet numbers in English as printed. Return ONLY a JSON object, no other text:

{
  "project": "project name, address, owner, architect, engineer, issue date",
  "scope": "2-4 sentences: what work this set covers",
  "sheets": [ { "number": "E.2.0", "title": "short title" } ],
  "power": [ "new/modified panels, feeders, breakers, load calculation, important equipment (AC, heaters, etc.) with breaker sizes" ],
  "lighting": [ { "type": "A", "description": "fixture + manufacturer + watts", "count": 12, "emergency": "how many EM if known" } ],
  "controls": [ "lighting control devices and counts (sensors, wall stations, room controllers)" ],
  "fire_alarm": [ "fire alarm devices and counts, compatibility notes" ],
  "low_voltage": [ "data, WAP, PA, card readers, CCTV etc." ],
  "demolition": [ "what must be removed" ],
  "watch_out": [ "risks, coordination items, things to verify in field, notes that cost money" ]
}

Use the tag counts for fixture and device quantities only from floor plan pages (not legends or
schedules). If a quantity is not clear, say "~" before it or leave count null. Never invent data.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return json({ error: 'Not signed in' }, 401);

    const { company_id, images, mode, text } = await req.json();
    const { data: isOwner } = await sb.rpc('is_company_owner', { target_company: company_id });
    if (!isOwner) return json({ error: 'Only the owner can use AI reading' }, 403);
    const summary = mode === 'summary';
    if (summary) {
      if (typeof text !== 'string' || text.length < 50) return json({ error: 'No text found in the PDF' }, 400);
    } else if (!Array.isArray(images) || images.length < 1 || images.length > 8) {
      return json({ error: 'Send 1 to 8 images' }, 400);
    }

    // Daily limit per company, so a public demo cannot run up the AI bill.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb
      .from('plan_ai_pages')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id)
      .gte('created_at', since);
    if ((count ?? 0) >= DAILY) return json({ error: `Daily AI limit reached (${DAILY} pages). Try again tomorrow.` }, 429);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set on the server' }, 500);

    const content = summary
      ? [{ type: 'text', text: `${SUMMARY_PROMPT}\n\n=== DRAWING SET TEXT ===\n${text.slice(0, 400000)}` }]
      : [
          ...images.map((b: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } })),
          { type: 'text', text: PROMPT },
        ];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content }] }),
    });
    const out = await r.json();
    if (!r.ok) return json({ error: out?.error?.message ?? `AI request failed (${r.status})` }, 502);

    const text = (out.content ?? [])
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('');
    const m = text.match(/\{[\s\S]*\}/);
    let result: unknown;
    try {
      result = JSON.parse(m ? m[0] : text);
    } catch {
      result = { notes: [text.slice(0, 4000)] };
    }
    return json({ result, usage: out.usage });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
