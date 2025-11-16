'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Component that refreshes auth state after OAuth callback.
 * This ensures the React Query cache is invalidated and refetched
 * when the user returns from OAuth authentication.
 */
export function AuthStateRefresher() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  useEffect(() => {
    // Check if we just authenticated by checking for auth state change
    const checkAuthAndRefresh = async () => {
      const sb = createSupabaseBrowserClient()
      
      // Check current auth state
      const { data: { user } } = await sb.auth.getUser()
      
      // If we have a user, invalidate the auth query cache to force a refetch
      // This ensures the UI updates immediately after OAuth redirect
      if (user) {
        queryClient.invalidateQueries({ queryKey: ['auth'] })
        queryClient.invalidateQueries({ queryKey: ['profile'] })
      }
    }

    // Run check on mount to refresh auth state after OAuth redirect
    checkAuthAndRefresh()

    // Also listen for auth state changes from Supabase
    const sb = createSupabaseBrowserClient()
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, _session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Invalidate queries when auth state changes
        queryClient.invalidateQueries({ queryKey: ['auth'] })
        queryClient.invalidateQueries({ queryKey: ['profile'] })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [searchParams, queryClient])

  // This component doesn't render anything
  return null
}

