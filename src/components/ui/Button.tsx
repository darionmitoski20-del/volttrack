import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // Electric yellow — reserved for primary actions & clock-in.
  primary:
    'bg-volt-500 text-navy-900 hover:bg-volt-400 active:bg-volt-600 font-semibold shadow-card',
  secondary:
    'bg-white text-ink border border-navy-100 hover:bg-navy-50 active:bg-navy-100',
  ghost: 'bg-transparent text-ink hover:bg-navy-100/70',
  danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700 font-medium',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 font-medium',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-14 px-6 text-base gap-2.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, fullWidth, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        // Large touch targets on mobile handled via size heights (>=44px at md/lg).
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});
