import { Link } from 'react-router-dom';
import { Check, Circle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  to: string;
  cta: string;
}

export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <Card className="mb-6 overflow-hidden border-volt-500/40 bg-white p-0">
      <div className="flex items-center justify-between gap-4 bg-navy-900 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">Company setup</h2>
          <p className="text-sm text-navy-300">
            {doneCount} of {steps.length} complete — finish setup to get your crew tracking time.
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-volt-500 text-sm font-semibold text-volt-400">
          {doneCount}/{steps.length}
        </div>
      </div>
      <ul className="divide-y divide-navy-50">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-3 px-5 py-3.5">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-navy-100 text-navy-400',
              )}
            >
              {step.done ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', step.done ? 'text-ink-subtle line-through' : 'text-ink')}>
                {step.label}
              </p>
              {!step.done && <p className="text-xs text-ink-muted">{step.description}</p>}
            </div>
            {!step.done && step.id === next?.id && (
              <Link
                to={step.to}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-volt-500 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-volt-400"
              >
                {step.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
