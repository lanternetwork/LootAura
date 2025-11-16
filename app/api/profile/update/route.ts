// NOTE: Writes → lootaura_v2.* only. Reads from views allowed. Do not write to views.
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'
import { logger } from '@/lib/log'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // CSRF protection check
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
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

    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }

    if (!body || typeof body !== 'object') {
      return fail(400, 'INVALID_INPUT', 'Invalid request body')
    }

    // Validate and sanitize input
    const updateData: {
      display_name?: string | null
      bio?: string | null
      location_city?: string | null
      location_region?: string | null
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    // Only include fields that are provided and valid
    if ('display_name' in body) {
      const displayName = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 80) : null
      updateData.display_name = displayName || null
    }

    if ('bio' in body) {
      const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 250) : null
      updateData.bio = bio || null
    }

    if ('city' in body) {
      const city = typeof body.city === 'string' ? body.city.trim() : null
      updateData.location_city = city || null
    }

    if ('region' in body) {
      const region = typeof body.region === 'string' ? body.region.trim() : null
      updateData.location_region = region || null
    }

    // Update profile using RLS client with schema scope
    // Note: profiles.id matches auth.uid(), RLS policy enforces ownership
    const rls = getRlsDb()
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

