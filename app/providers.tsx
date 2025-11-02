'use client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { MobileFilterProvider } from '@/contexts/MobileFilterContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileFilterProvider>
        {children}
      </MobileFilterProvider>
    </QueryClientProvider>
  )
}
