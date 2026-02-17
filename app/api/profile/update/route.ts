// NOTE: Writes → lootaura_v2.* only. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'
import { logger } from '@/lib/log'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

async function updateProfileHandler(request: NextRequest): Promise<NextResponse> {
  // CSRF protection check
  // Note: Do not log CSRF tokens or cookies (PII/security sensitive)
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE_UPDATE] POST request received:', {
      hasCsrfHeader: !!request.headers.get('x-csrf-token'),
      hasCookieHeader: !!request.headers.get('cookie'),
      // Do not log actual token/cookie values
    })
  }
  
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE_UPDATE] CSRF check failed:', {
        error: csrfError,
        status: csrfError.status,
      })
    }
    return csrfError
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE_UPDATE] CSRF check passed, proceeding with profile update')
  }

  try {
    const supabase = createSupabaseServerClient()
    
    // Guard against undefined/null supabase client
    if (!supabase || !supabase.auth) {
      return fail(500, 'INTERNAL_ERROR', 'Failed to initialize Supabase client')
    }
    
    const authResult = await supabase.auth.getUser()

    // Guard against undefined/null auth result
    if (!authResult || typeof authResult !== 'object') {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    const { data, error: authError } = authResult
    const user = data?.user

    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    // Check if account is locked
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      // assertAccountNotLocked throws NextResponse if locked
      if (error instanceof NextResponse) return error
      throw error
    }

    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }

    // Validate input with Zod schema
    const validationResult = ProfileUpdateSchema.safeParse(body)
    if (!validationResult.success) {
      return fail(400, 'INVALID_INPUT', 'Invalid profile update data', {
        details: validationResult.error.issues,
      })
    }

    const validatedData = validationResult.data

    // Build update data from validated input
    const updateData: {
      display_name?: string | null
      bio?: string | null
      location_city?: string | null
      location_region?: string | null
      avatar_url?: string | null
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    // Only include fields that are provided
    if ('display_name' in validatedData) {
      updateData.display_name = validatedData.display_name || null
    }

    if ('bio' in validatedData) {
      updateData.bio = validatedData.bio || null
    }

    if ('location_city' in validatedData) {
      updateData.location_city = validatedData.location_city || null
    }

    if ('location_region' in validatedData) {
      updateData.location_region = validatedData.location_region || null
    }

    if ('avatar_url' in validatedData) {
      updateData.avatar_url = validatedData.avatar_url || null
    }

    // Update profile using RLS client with schema scope
    // Note: profiles.id matches auth.uid(), RLS policy enforces ownership
    const rls = await getRlsDb()
    const updateResult = await fromBase(rls, 'profiles')
      .update(updateData)
      .eq('id', user.id)
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, social_links')
      .single()

    // Check if updateResult is valid and has expected structure
    if (updateResult == null || typeof updateResult !== 'object') {
      const error = new Error('Update returned undefined or invalid')
      logger.error('Profile update returned invalid result', error, {
        component: 'profile/update',
        operation: 'update_profile',
        userId: user.id,
      })
      Sentry.captureException(error, { tags: { operation: 'updateProfile' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update profile')
    }

    // Now safe to check for properties
    if (!('data' in updateResult || 'error' in updateResult)) {
      const error = new Error('Update result missing expected properties')
      logger.error('Profile update result missing properties', error, {
        component: 'profile/update',
        operation: 'update_profile',
        userId: user.id,
      })
      Sentry.captureException(error, { tags: { operation: 'updateProfile' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update profile')
    }

    const { data: updatedProfile, error: updateError } = updateResult as { data: any; error: any }

    if (updateError) {
      logger.error('Profile update error', updateError instanceof Error ? updateError : new Error(String(updateError)), {
        component: 'profile/update',
        operation: 'update_profile',
        userId: user.id,
      })
      Sentry.captureException(updateError, { tags: { operation: 'updateProfile' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update profile', {
        supabase: updateError.message,
        code: updateError.code,
      })
    }

    return ok({ data: { profile: updatedProfile } })
  } catch (e: any) {
    logger.error('Unexpected error in profile update', e instanceof Error ? e : new Error(String(e)), {
      component: 'profile/update',
      operation: 'update_profile',
    })
    Sentry.captureException(e, { tags: { operation: 'updateProfile' } })
    return fail(500, 'INTERNAL_ERROR', 'An error occurred while updating your profile')
  }
}

export async function POST(request: NextRequest) {
  // Get user ID for rate limiting (after CSRF check but before handler)
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  const { withRateLimit } = await import('@/lib/rateLimit/withRateLimit')
  const { Policies } = await import('@/lib/rateLimit/policies')

  return withRateLimit(
    updateProfileHandler,
    [Policies.MUTATE_MINUTE, Policies.MUTATE_DAILY],
    { userId }
  )(request)
}

