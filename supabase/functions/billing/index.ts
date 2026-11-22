// VoltTrack — billing edge function (Stripe)
//
//   action "checkout" (owner)  : opens a Stripe Checkout page for a package, returns { url }
//   action "sync"     (owner)  : after Checkout (session_id) or any time: reads the subscription from Stripe
//                                and saves it in company_billing
//   action "portal"   (owner)  : Stripe customer portal (change card, cancel), returns { url }
//
// Deploy via the Supabase Dashboard: Edge Functions -> billing -> Code -> paste -> Deploy.
// "Verify JWT with legacy secret" must be OFF (this function checks the user itself).
//
// Secrets (Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY  - Stripe secret key (sk_test_… for testing)
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
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const TRIAL_DAYS = 30;

// The packages. Prices in US cents, per month.
const PLANS: Record<string, { name: string; price: number; reads: number }> = {
  starter: { name: 'VoltTrack Starter', price: 4900, reads: 30 },
  pro: { name: 'VoltTrack Pro', price: 7900, reads: 50 },
  business: { name: 'VoltTrack Business', price: 14900, reads: 100 },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Stripe API call with form-encoded parameters. */
// deno-lint-ignore no-explicit-any
async function stripe(path: string, params?: Record<string, string>, method = params ? 'POST' : 'GET'): Promise<any> {
  const url = `https://api.stripe.com/v1/${path}`;
  const r = await fetch(method === 'GET' && params ? `${url}?${new URLSearchParams(params)}` : url, {
    method,
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' && params ? new URLSearchParams(params) : undefined,
  });
  const out = await r.json();
  if (!r.ok) throw new Error(`Stripe: ${out?.error?.message ?? r.status}`);
  return out;
}

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: 'Not signed in' }, 401);
    const admin = createClient(SB_URL, SB_SERVICE);

    const body = await req.json();
    const { company_id, action } = body;
    const { data: member } = await admin.from('company_members').select('role')
      .eq('company_id', company_id).eq('user_id', u.user.id).eq('status', 'active').maybeSingle();
    if (!member) return json({ error: 'Not a member of this company' }, 403);
    if (member.role !== 'owner') return json({ error: 'Only the owner can manage the plan' }, 403);
    if (!STRIPE_KEY) return json({ error: 'STRIPE_SECRET_KEY is not set on the server' }, 500);

    const { data: billing } = await admin.from('company_billing').select('*').eq('company_id', company_id).maybeSingle();

    // ------------------------------------------------------------------ open Checkout
    if (action === 'checkout') {
      const plan = PLANS[body.plan];
      if (!plan) return json({ error: 'Unknown plan' }, 400);
      const back = typeof body.return_url === 'string' && /^https?:\/\//.test(body.return_url) ? body.return_url : null;
      if (!back) return json({ error: 'return_url is required' }, 400);
      const sep = back.includes('?') ? '&' : '?';

      // Already paying: change the package in the portal instead of a second subscription.
      if (billing?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(billing.status)) {
        return json({ error: 'You already have a plan. Use "Manage billing" to change or cancel it.' }, 409);
      }

      const { data: company } = await admin.from('companies').select('name, email').eq('id', company_id).maybeSingle();
      const p: Record<string, string> = {
        mode: 'subscription',
        client_reference_id: company_id,
        'metadata[company_id]': company_id,
        'metadata[plan]': body.plan,
        'subscription_data[metadata][company_id]': company_id,
        'subscription_data[metadata][plan]': body.plan,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(plan.price),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][product_data][name]': plan.name,
        'line_items[0][price_data][product_data][description]': `${plan.reads} AI plan reads per month, unlimited employees and job sites`,
        allow_promotion_codes: 'true',
        success_url: `${back}${sep}billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${back}${sep}billing=cancel`,
      };
      // The 30-day free trial only for a company that never had a plan.
      if (!billing) p['subscription_data[trial_period_days]'] = String(TRIAL_DAYS);
      if (billing?.stripe_customer_id) p.customer = billing.stripe_customer_id;
      else if (company?.email) p.customer_email = company.email;
      const session = await stripe('checkout/sessions', p);
      return json({ url: session.url });
    }

    // ------------------------------------------------------------------ read the subscription from Stripe
    if (action === 'sync') {
      // deno-lint-ignore no-explicit-any
      let sub: any = null;
      let customer: string | null = billing?.stripe_customer_id ?? null;
      if (typeof body.session_id === 'string' && body.session_id.startsWith('cs_')) {
        const s = await stripe(`checkout/sessions/${body.session_id}`, { 'expand[]': 'subscription' }, 'GET');
        if (s.client_reference_id !== company_id) return json({ error: 'This payment belongs to another company' }, 403);
        sub = s.subscription;
        customer = s.customer ?? customer;
      } else if (billing?.stripe_subscription_id) {
        sub = await stripe(`subscriptions/${billing.stripe_subscription_id}`, undefined, 'GET');
      }
      if (!sub) return json({ billing });

      const planId = sub.metadata?.plan ?? billing?.plan;
      const plan = PLANS[planId];
      if (!plan) return json({ error: 'Unknown plan on the subscription' }, 400);
      const item = sub.items?.data?.[0];
      const row = {
        company_id,
        plan: planId,
        reads_per_month: plan.reads,
        status: sub.status,
        stripe_customer_id: customer,
        stripe_subscription_id: sub.id,
        current_period_end: iso(sub.current_period_end ?? item?.current_period_end),
        trial_end: iso(sub.trial_end),
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin.from('company_billing').upsert(row);
      if (error) throw error;
      return json({ billing: row });
    }

    // ------------------------------------------------------------------ customer portal
    if (action === 'portal') {
      if (!billing?.stripe_customer_id) return json({ error: 'No plan yet' }, 400);
      const back = typeof body.return_url === 'string' && /^https?:\/\//.test(body.return_url) ? body.return_url : null;
      if (!back) return json({ error: 'return_url is required' }, 400);
      const s = await stripe('billing_portal/sessions', { customer: billing.stripe_customer_id, return_url: back });
      return json({ url: s.url });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
