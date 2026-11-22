import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, ExternalLink, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { CompanyBilling } from '@/lib/database.types';

export const PLANS = [
  { id: 'starter', name: 'Starter', price: 49, reads: 30, note: 'For small crews' },
  { id: 'pro', name: 'Pro', price: 79, reads: 50, note: 'Most popular' },
  { id: 'business', name: 'Business', price: 149, reads: 100, note: 'For busy contractors' },
] as const;

const FEATURES = ['Unlimited employees & job sites', 'Hours, timesheets & reports', 'Plan Reader with AI reports', '30 days free, cancel any time'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callBilling(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('billing', { body });
  if (error) {
    let msg = error.message;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = await (error as any).context?.json?.();
      if (b?.error) msg = b.error;
    } catch { /* keep message */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** Plan & billing: the company's package (Stripe), AI reads used this month, and buying / managing a plan. */
export function BillingCard() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const wanted = params.get('plan');

  const billing = useQuery({
    queryKey: ['billing', companyId],
    queryFn: async (): Promise<CompanyBilling | null> => {
      const { data, error } = await supabase.from('company_billing').select('*').eq('company_id', companyId).maybeSingle();
      if (error) throw error;
      return data as CompanyBilling | null;
    },
  });

  const used = useQuery({
    queryKey: ['billing-usage', companyId],
    queryFn: async () => {
      const { count, error } = await supabase.from('plan_ai_usage').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).gte('created_at', monthStart());
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Back from Stripe Checkout: save the subscription.
  const synced = useRef(false);
  useEffect(() => {
    const result = params.get('billing');
    if (!result || synced.current) return;
    synced.current = true;
    const sessionId = params.get('session_id');
    const next = new URLSearchParams(params);
    next.delete('billing');
    next.delete('session_id');
    next.delete('plan');
    if (result === 'success' && sessionId) {
      setBusy('sync');
      callBilling({ action: 'sync', company_id: companyId, session_id: sessionId })
        .then(() => showToast('Plan active', 'Thank you! Your plan is ready.'))
        .catch((e) => showToast('Could not confirm the payment', e instanceof Error ? e.message : String(e)))
        .finally(() => {
          setBusy(null);
          void qc.invalidateQueries({ queryKey: ['billing', companyId] });
        });
    } else if (result === 'cancel') {
      showToast('Payment cancelled', 'No plan was bought.');
    }
    setParams(next, { replace: true });
  }, [params, setParams, companyId, qc, showToast]);

  // Came from the pricing page: show this section.
  useEffect(() => {
    if (wanted || window.location.hash === '#billing') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [wanted]);

  const returnUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/app/settings`;

  const buy = async (plan: string) => {
    setBusy(plan);
    try {
      const { url } = await callBilling({ action: 'checkout', company_id: companyId, plan, return_url: returnUrl() });
      window.location.href = url;
    } catch (e) {
      showToast('Could not open payment', e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const portal = async () => {
    setBusy('portal');
    try {
      const { url } = await callBilling({ action: 'portal', company_id: companyId, return_url: returnUrl() });
      window.location.href = url;
    } catch (e) {
      showToast('Could not open billing', e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy('sync');
    try {
      await callBilling({ action: 'sync', company_id: companyId });
      await qc.invalidateQueries({ queryKey: ['billing', companyId] });
    } catch (e) {
      showToast('Could not refresh', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const b = billing.data;
  const live = b && ['active', 'trialing', 'past_due'].includes(b.status);
  const current = live ? PLANS.find((p) => p.id === b.plan) : undefined;
  const limit = live ? b.reads_per_month : null;
  const usedN = used.data ?? 0;

  return (
    <div ref={ref} id="billing" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Plan &amp; billing</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {busy === 'sync' && <p className="text-sm text-ink-muted">Checking your plan with Stripe…</p>}

          {live && current ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-50 px-4 py-3">
              <div>
                <p className="font-semibold text-ink">
                  {current.name} · ${current.price}/month{' '}
                  <Badge tone={b.status === 'past_due' ? 'warning' : 'success'}>{b.status === 'trialing' ? 'free trial' : b.status.replace('_', ' ')}</Badge>
                </p>
                <p className="text-sm text-ink-muted">
                  {b.status === 'trialing' && b.trial_end ? `Free until ${fmt(b.trial_end)}. ` : ''}
                  {b.current_period_end ? `Renews ${fmt(b.current_period_end)}.` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" loading={busy === 'sync'} onClick={refresh}>Refresh</Button>
                <Button variant="secondary" size="sm" icon={<ExternalLink className="h-4 w-4" />} loading={busy === 'portal'} onClick={portal}>Manage billing</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              {b ? `Your plan is ${b.status}. Choose a plan to keep using AI plan reading.` : 'Pick a plan. The first 30 days are free — you can cancel before you pay anything.'}
            </p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink"><Sparkles className="h-4 w-4 text-volt-600" /> AI plan reads this month</span>
              <span className="font-medium text-ink">{usedN}{limit ? ` / ${limit}` : ''}</span>
            </div>
            {limit ? (
              <div className="h-2 overflow-hidden rounded-full bg-navy-100">
                <div className={`h-full rounded-full ${usedN >= limit ? 'bg-red-500' : 'bg-volt-500'}`} style={{ width: `${Math.min(100, (usedN / limit) * 100)}%` }} />
              </div>
            ) : (
              <p className="text-xs text-ink-subtle">Without a plan: a few test reads per day.</p>
            )}
          </div>

          {!live && (
            <div className="grid gap-3 sm:grid-cols-3">
              {PLANS.map((p) => {
                const highlight = wanted ? wanted === p.id : p.id === 'pro';
                return (
                  <div key={p.id} className={`flex flex-col rounded-xl border p-4 ${highlight ? 'border-volt-500 ring-2 ring-volt-400/40' : 'border-navy-100'}`}>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{p.note}</p>
                    <p className="mt-1 text-lg font-semibold text-ink">{p.name}</p>
                    <p className="text-2xl font-bold text-ink">${p.price}<span className="text-sm font-normal text-ink-muted">/mo</span></p>
                    <p className="mt-1 text-sm font-medium text-ink">{p.reads} AI plan reads / month</p>
                    <ul className="mt-3 flex-1 space-y-1">
                      {FEATURES.map((f) => (
                        <li key={f} className="flex gap-1.5 text-xs text-ink-muted"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{f}</li>
                      ))}
                    </ul>
                    <Button className="mt-4 w-full" variant={highlight ? 'primary' : 'secondary'} loading={busy === p.id} disabled={!!busy && busy !== p.id} onClick={() => buy(p.id)}>
                      Start free trial
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
