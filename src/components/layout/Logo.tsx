import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-volt-500">
        <Zap className="h-5 w-5 text-navy-900" fill="currentColor" strokeWidth={1.5} />
      </span>
      {!compact && (
        <span className="text-lg tracking-tight text-white">
          Volt<span className="text-volt-400">Track</span>
        </span>
      )}
    </span>
  );
}
