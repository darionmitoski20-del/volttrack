import { AlertTriangle, Inbox, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 rounded-2xl bg-navy-100 p-3.5">
        <Icon className="h-6 w-6 text-navy-700" />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)} role="alert">
      <div className="mb-4 rounded-2xl bg-red-100 p-3.5">
        <AlertTriangle className="h-6 w-6 text-red-700" />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" icon={<RotateCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Uniform loading/error/empty/content switch for a TanStack Query result.
 */
export function QueryBoundary<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: {
  query: { isLoading: boolean; isError: boolean; error?: unknown; data?: T; refetch: () => void };
  loading?: React.ReactNode;
  empty?: React.ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <SkeletonRows />}</>;
  if (query.isError) {
    return (
      <ErrorState
        description={query.error instanceof Error ? query.error.message : undefined}
        onRetry={query.refetch}
      />
    );
  }
  const data = query.data as T;
  if (empty && isEmpty && isEmpty(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
