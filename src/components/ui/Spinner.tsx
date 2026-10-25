import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50" role="status" aria-live="polite">
      <Spinner className="h-8 w-8 text-volt-500" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
