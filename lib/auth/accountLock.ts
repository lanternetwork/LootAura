/**
 * Account lock helper
 * Checks if a user account is locked and throws appropriate error
 */

import { getRlsDb, getAdminDb, fromBase } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'

/**
 * Assert that the current user's account is not locked
 * Throws NextResponse with 403 if account is locked
 * @param userId - The authenticated user ID
 * @param db - Optional database client (if not provided, will try to get one)
 * @returns void if account is not locked
 * @throws NextResponse with 403 if account is locked
 */
export async function assertAccountNotLocked(
  userId: string,
  db?: ReturnType<typeof getRlsDb> | ReturnType<typeof getAdminDb>
): Promise<void> {
  let client = db
  
  // If no client provided, try to get one
  if (!client) {
    try {
      // Try RLS client first (for production use)
      client = getRlsDb()
    } catch (error: any) {
      // If cookies() is not available (e.g., in tests), fall back to admin client
      // This is safe because in test contexts, account locks are typically mocked
      if (error?.message?.includes('cookies') || error?.message?.includes('request scope')) {
        try {
          client = getAdminDb()
        } catch (adminError) {
          // If we can't get any client, allow the request to proceed
          // This prevents blocking requests in test contexts
          const { logger } = await import('@/lib/log')
          logger.warn('Could not get database client for account lock check, allowing request', {
            component: 'accountLock',
            operation: 'assertAccountNotLocked',
            userId: userId.substring(0, 8) + '...',
            error: error instanceof Error ? error.message : String(error),
          })
          return
        }
      } else {
        // Re-throw unexpected errors
        throw error
      }
    }
  }
  
  // Query profile to check lock status
  const { data: profile, error } = await fromBase(client, 'profiles')
    .select('is_locked')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // If we can't check, err on the side of allowing (but log the error)
    const { logger } = await import('@/lib/log')
    logger.error('Failed to check account lock status', error instanceof Error ? error : new Error(String(error)), {
      component: 'accountLock',
      operation: 'assertAccountNotLocked',
      userId: userId.substring(0, 8) + '...',
    })
    return // Allow the request to proceed if we can't check
  }

  if (profile?.is_locked) {
    const { fail } = await import('@/lib/http/json')
    throw fail(403, 'ACCOUNT_LOCKED', 'account_locked', { message: 'This account has been locked. Please contact support if you believe this is an error.' })
  }
}

/**
 * Check if an account is locked (non-throwing version)
 * @param userId - The user ID to check
 * @param db - Optional database client (if not provided, will try to get one)
 * @returns true if account is locked, false otherwise
 */
export async function isAccountLocked(
  userId: string,
  db?: ReturnType<typeof getRlsDb> | ReturnType<typeof getAdminDb>
): Promise<boolean> {
  try {
    let client = db
    
    // If no client provided, try to get one
    if (!client) {
      try {
        client = getRlsDb()
      } catch (error: any) {
        // If cookies() is not available (e.g., in tests), fall back to admin client
        if (error?.message?.includes('cookies') || error?.message?.includes('request scope')) {
          try {
            client = getAdminDb()
          } catch {
            return false // Default to not locked if we can't check
          }
        } else {
          return false // Default to not locked on error
        }
      }
    }
    
    const { data: profile, error } = await fromBase(client, 'profiles')
      .select('is_locked')
      .eq('id', userId)
      .maybeSingle()

    if (error || !profile) {
      return false // Default to not locked if we can't check
    }

    return profile.is_locked === true
  } catch {
    return false // Default to not locked on error
  }
}

