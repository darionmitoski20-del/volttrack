import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const baseControl =
  'w-full rounded-xl border bg-white px-3 text-sm text-ink placeholder:text-ink-subtle ' +
  'transition-colors focus:border-volt-500 disabled:bg-navy-50 disabled:text-ink-muted';

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errId = error ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(baseControl, 'h-11', invalid ? 'border-red-400' : 'border-navy-100', className)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseControl, 'min-h-[88px] py-2.5', invalid ? 'border-red-400' : 'border-navy-100', className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseControl, 'h-11 pr-8', invalid ? 'border-red-400' : 'border-navy-100', className)}
      {...props}
    >
      {children}
    </select>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string }
>(function Checkbox({ className, label, id, ...props }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <label htmlFor={inputId} className={cn('flex items-center gap-2.5 text-sm text-ink', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="h-5 w-5 rounded border-navy-200 text-volt-500 focus:ring-volt-500"
        {...props}
      />
      {label}
    </label>
  );
});
