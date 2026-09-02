'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// One QueryClient per browser session, created lazily in state so it
// survives re-renders (the official Next.js App Router pattern for a
// client-only cache — never a module-level singleton, which would leak
// across users on the server).
//
// staleTime/gcTime are both Infinity by default because the primary
// consumer of this cache today is the 'erp' namespace bridged from
// Firebase's own realtime onValue listeners (see ERPProvider in
// lib/erp/provider.tsx) via queryClient.setQueryData — there's no queryFn
// backing those entries for React Query to refetch, and nothing should
// evict a live Firebase-fed cache entry just because no component happens
// to be reading it via useQuery yet. Any future query that *does* fetch
// from a real endpoint (e.g. a REST API route) can override these per-call.
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
    },
  })
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
