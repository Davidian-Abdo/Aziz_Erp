import { QueryClient } from '@tanstack/react-query'

/*
 * Server state (architecture-spec §5.1). No state-management library: TanStack
 * Query holds what came from the database, React holds the rest.
 *
 * Retries are safe on reads. They are safe on the two WRITE RPCs too, but only
 * because those are idempotent on `request_id` (architecture-spec §4.1) — a
 * retried purchase returns the cached result instead of posting twice, and a
 * duplicated purchase inflates outflow, which this model reports as PROFIT.
 * Mutations that are not idempotent must opt out of retry explicitly.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The shop's figures change only when someone enters something, and the
      // person entering it is the person reading it.
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
