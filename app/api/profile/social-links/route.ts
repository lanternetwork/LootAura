// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed.
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { normalizeSocialLinks, type SocialLinks } from '@/lib/profile/social'
import { ok, fail } from '@/lib/http/json'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
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

    if (!body || typeof body !== 'object' || !body.links) {
      return fail(400, 'INVALID_INPUT', 'Missing or invalid links field')
    }

    // Normalize social links
    const normalizedLinks = normalizeSocialLinks(body.links as Partial<SocialLinks>)

    // Update profile using RLS client with schema scope
    // Note: profiles.id matches auth.uid(), RLS policy enforces ownership
    const rls = getRlsDb()
    const updateResult = await fromBase(rls, 'profiles')
      .update({
        social_links: normalizedLinks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('social_links')
      .single()

    // Check if updateResult is valid and has expected structure
    // Must check for null/undefined first before using 'in' operator
    if (updateResult == null || typeof updateResult !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[PROFILE/SOCIAL_LINKS] Update returned undefined or invalid:', updateResult)
      }
      Sentry.captureException(new Error('Update returned undefined or invalid'), { tags: { operation: 'updateSocialLinks' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update social links')
    }

    // Now safe to check for properties
    if (!('data' in updateResult || 'error' in updateResult)) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[PROFILE/SOCIAL_LINKS] Update result missing data/error properties:', updateResult)
      }
      Sentry.captureException(new Error('Update result missing expected properties'), { tags: { operation: 'updateSocialLinks' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update social links')
    }

    const { data: updatedProfile, error: updateError } = updateResult as { data: any; error: any }

    if (updateError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[PROFILE/SOCIAL_LINKS] Update error:', updateError)
      }
      Sentry.captureException(updateError, { tags: { operation: 'updateSocialLinks' } })
      return fail(500, 'UPDATE_FAILED', 'Failed to update social links', {
        supabase: updateError.message,
        code: updateError.code,
      })
    }

    return ok({ data: { social_links: updatedProfile?.social_links || normalizedLinks } })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PROFILE/SOCIAL_LINKS] Unexpected error:', e)
    }
    Sentry.captureException(e, { tags: { operation: 'updateSocialLinks' } })
    return fail(500, 'INTERNAL_ERROR', e.message)
  }
}

