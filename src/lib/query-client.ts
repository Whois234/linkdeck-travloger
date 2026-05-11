import { QueryClient } from '@tanstack/react-query';

// Shared fetcher — wraps our existing fetch+json pattern
export async function apiFetch<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Request failed');
  return data.data as T;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Never treat cached data as stale on mount — refetch only in background
        staleTime: 30 * 1000,          // 30s default
        gcTime:    5  * 60 * 1000,     // keep unused cache for 5 min
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect:   true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// Static master data — 5 min stale, so navigating away and back never re-fetches
export const STATIC_STALE = 5 * 60 * 1000;
// Live CRM data — 30s stale
export const LIVE_STALE   = 30 * 1000;
