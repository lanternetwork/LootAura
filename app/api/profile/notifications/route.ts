// NOTE: Writes → lootaura_v2.* only. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'
import { logger } from '@/lib/log'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const NotificationPreferencesSchema = z.object({
  email_favorites_digest_enabled: z.boolean().optional(),
  email_seller_weekly_enabled: z.boolean().optional(),
})

export async function GET() {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return fail(401, 'AUTH_REQUIRED', 'Authentication required')
  // Note: GET requests are read-only and should NOT be blocked by account locks
  // Only write operations (POST, PUT, DELETE) should enforce account locks

  try {
    // Read from profiles_v2 view
    const { data, error } = await sb
      .from('profiles_v2')
      .select('email_favorites_digest_enabled, email_seller_weekly_enabled')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      logger.error('Failed to fetch notification preferences', error instanceof Error ? error : new Error(String(error)), {
        component: 'profile/notifications',
        operation: 'get_notification_preferences',
        userId: user.id,
      })
      return fail(500, 'FETCH_ERROR', 'Failed to fetch notification preferences')
    }

    // Default to true if null/undefined (for older rows)
    const preferences = {
      email_favorites_digest_enabled: data?.email_favorites_digest_enabled ?? true,
      email_seller_weekly_enabled: data?.email_seller_weekly_enabled ?? true,
    }

    return ok({ data: preferences })
  } catch (e: any) {
    logger.error('Unexpected error fetching notification preferences', e instanceof Error ? e : new Error(String(e)), {
      component: 'profile/notifications',
      operation: 'get_notification_preferences',
    })
    Sentry.captureException(e, { tags: { operation: 'getNotificationPreferences' } })
    return fail(500, 'INTERNAL_ERROR', 'An error occurred while fetching notification preferences')
  }
}

export async function PUT(request: NextRequest) {
  // CSRF protection check
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return fail(401, 'AUTH_REQUIRED', 'Authentication required')
  try {
    const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
    await assertAccountNotLocked(user.id)
  } catch (error) {
    if (error instanceof NextResponse) return error
    throw error
  }

  try {
    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }

    // Validate input
    const parsed = NotificationPreferencesSchema.safeParse(body)
    if (!parsed.success) {
      return fail(400, 'INVALID_INPUT', 'Invalid notification preferences', {
        details: parsed.error.issues,
      })
    }

    // Build update object with only provided fields
    const updateData: {
      email_favorites_digest_enabled?: boolean
      email_seller_weekly_enabled?: boolean
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if ('email_favorites_digest_enabled' in parsed.data) {
      updateData.email_favorites_digest_enabled = parsed.data.email_favorites_digest_enabled
    }

    if ('email_seller_weekly_enabled' in parsed.data) {
      updateData.email_seller_weekly_enabled = parsed.data.email_seller_weekly_enabled
    }

    if (Object.keys(updateData).length === 1) {
      // Only updated_at was set, no actual preferences to update
      return fail(400, 'NO_FIELDS', 'No notification preferences provided to update')
    }

    // Update profile using RLS client with schema scope
    const rls = await getRlsDb()
    const updateResult = await fromBase(rls, 'profiles')
      .update(updateData)
      .eq('id', user.id)
      .select('email_favorites_digest_enabled, email_seller_weekly_enabled')
      .single()

    if (!updateResult || typeof updateResult !== 'object' || !('data' in updateResult || 'error' in updateResult)) {
      const error = new Error('Update returned invalid result')
      logger.error('Notification preferences update returned invalid result', error, {
        component: 'profile/notifications',
        operation: 'update_notification_preferences',
        userId: user.id,
      })
      Sentry.captureException(error, { tags: { operation: 'updateNotificationPreferences' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update notification preferences')
    }

    const { data: updatedPreferences, error: updateError } = updateResult as { data: any; error: any }

    if (updateError) {
      logger.error('Notification preferences update error', updateError instanceof Error ? updateError : new Error(String(updateError)), {
        component: 'profile/notifications',
        operation: 'update_notification_preferences',
        userId: user.id,
      })
      Sentry.captureException(updateError, { tags: { operation: 'updateNotificationPreferences' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update notification preferences', {
        supabase: updateError.message,
        code: updateError.code,
      })
    }

    // Default to true if null/undefined
    const preferences = {
      email_favorites_digest_enabled: updatedPreferences?.email_favorites_digest_enabled ?? true,
      email_seller_weekly_enabled: updatedPreferences?.email_seller_weekly_enabled ?? true,
    }

    return ok({ data: preferences })
  } catch (e: any) {
    logger.error('Unexpected error updating notification preferences', e instanceof Error ? e : new Error(String(e)), {
      component: 'profile/notifications',
      operation: 'update_notification_preferences',
    })
    Sentry.captureException(e, { tags: { operation: 'updateNotificationPreferences' } })
    return fail(500, 'INTERNAL_ERROR', 'An error occurred while updating notification preferences')
  }
}

