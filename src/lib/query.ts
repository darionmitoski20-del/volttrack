import { MutationCache, QueryClient } from '@tanstack/react-query';

// After any successful change (hours added, clocked in/out, entry edited, timesheet
// submitted…), refresh what is on screen, so totals such as "Today", "This week" and
// "To submit" never stay at an old value until the page is reloaded.
// Plan Reader data is left alone: it is large and its hooks refresh it themselves.
function refreshAfterChange() {
  void queryClient.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey[0];
      return !(typeof k === 'string' && (k.startsWith('plan') || k === 'sheet-images'));
    },
  });
}

export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => refreshAfterChange(),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
