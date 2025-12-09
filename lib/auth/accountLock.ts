/**
 * Account lock helper
 * Checks if a user account is locked and throws appropriate error
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { fail } from '@/lib/http/json'
import { NextResponse } from 'next/server'

/**
 * Assert that the current user's account is not locked
 * Throws NextResponse with 403 if account is locked
 * @param userId - The authenticated user ID
 * @returns void if account is not locked
 * @throws NextResponse with 403 if account is locked
 */
export async function assertAccountNotLocked(userId: string): Promise<void> {
  const db = getRlsDb()
  
  // Query profile to check lock status
  const { data: profile, error } = await fromBase(db, 'profiles')
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
    throw NextResponse.json(
      { error: 'account_locked', message: 'This account has been locked. Please contact support if you believe this is an error.' },
      { status: 403 }
    )
  }
}

/**
 * Check if an account is locked (non-throwing version)
 * @param userId - The user ID to check
 * @returns true if account is locked, false otherwise
 */
export async function isAccountLocked(userId: string): Promise<boolean> {
  try {
    const db = getRlsDb()
    const { data: profile, error } = await fromBase(db, 'profiles')
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

