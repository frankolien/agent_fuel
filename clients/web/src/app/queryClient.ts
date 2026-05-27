import { QueryClient } from "@tanstack/react-query";
import { HttpError } from "@/lib/http";

// One client per app. Defaults chosen for an authed dashboard:
//   • staleTime 30s — most screens (agents/vaults) tolerate stale data while
//     the WS stream pushes fresh frames into the cache (slice 4.W.8).
//   • Don't retry 4xx — auth (401) and not-found (404) are terminal; retrying
//     just delays the error UI without changing the outcome.
//   • Don't refetch on window focus — the WS stream is the source of truth
//     for "is this fresh?", focus refetches just add load.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
