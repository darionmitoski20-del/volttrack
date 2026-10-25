import { useId, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small "?" icon that reveals a short explanation on hover/focus. */
export function InfoTooltip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex text-ink-subtle hover:text-ink-muted focus:outline-none focus:text-ink-muted"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-pop"
        >
          {text}
        </span>
      )}
    </span>
  );
}
