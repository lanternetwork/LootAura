'use client'

import { useEffect } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { isDebugEnabled } from '@/lib/debug'

/**
 * Component that refreshes auth state after OAuth callback.
 * This ensures the React Query cache is invalidated and refetched
 * when the user returns from OAuth authentication.
 */
export function AuthStateRefresher() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  useEffect(() => {
    const sb = createSupabaseBrowserClient()
    
    // Check if we just came from OAuth callback (no code param, but might have been redirected)
    // Also check if we're on a page that might have just received auth cookies
    const checkAuthAndRefresh = async () => {
      try {
        // Force a session refresh by calling getUser which reads from cookies
        const { data: { user }, error } = await sb.auth.getUser()
        
        if (error) {
          if (isDebugEnabled) {
            console.log('[AUTH_REFRESHER] Error getting user:', error.message)
          }
          return
        }
        
        // If we have a user, invalidate the auth query cache to force a refetch
        // This ensures the UI updates immediately after OAuth redirect
        if (user) {
          if (isDebugEnabled) {
            console.log('[AUTH_REFRESHER] User found, invalidating queries:', user.id)
          }
          queryClient.invalidateQueries({ queryKey: ['auth'] })
          queryClient.invalidateQueries({ queryKey: ['profile'] })
        } else {
          if (isDebugEnabled) {
            console.log('[AUTH_REFRESHER] No user found')
          }
        }
      } catch (error) {
        if (isDebugEnabled) {
          console.error('[AUTH_REFRESHER] Error checking auth:', error)
        }
      }
    }

    // Run check on mount and when pathname changes (e.g., after OAuth redirect)
    checkAuthAndRefresh()

    // Also listen for auth state changes from Supabase
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (isDebugEnabled) {
        console.log('[AUTH_REFRESHER] Auth state changed:', event, session?.user?.id)
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Invalidate queries when auth state changes
        queryClient.invalidateQueries({ queryKey: ['auth'] })
        queryClient.invalidateQueries({ queryKey: ['profile'] })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [searchParams, pathname, queryClient])

  // This component doesn't render anything
  return null
}

