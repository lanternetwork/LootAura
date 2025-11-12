// NOTE: Writes → lootaura_v2.* only. Reads from views allowed. Do not write to views.
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fromBase } from '@/lib/supabase/clients'
import { normalizeSocialLinks, type SocialLinks } from '@/lib/profile/social'
import { ok, fail } from '@/lib/http/json'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
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

    if (!body || typeof body !== 'object' || !body.links) {
      return fail(400, 'INVALID_INPUT', 'Missing or invalid links field')
    }

    // Normalize social links
    const normalizedLinks = normalizeSocialLinks(body.links as Partial<SocialLinks>)

    // Ensure normalizedLinks is a valid JSONB object (not null/undefined)
    const socialLinksValue = Object.keys(normalizedLinks).length > 0 ? normalizedLinks : {}

    // Update profile using RLS client with schema scope
    // Note: profiles.id matches auth.uid(), RLS policy enforces ownership
    // Use the authenticated client with schema applied to ensure session is available
    // This matches the pattern used in other working routes like items_v2
    const rls = supabase.schema('lootaura_v2')
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PROFILE/SOCIAL_LINKS] Updating social links:', {
        userId: user.id,
        socialLinksValue,
        rlsClientType: typeof rls,
        hasFrom: typeof (rls as any).from === 'function',
      })
    }
    
    const updateResult = await fromBase(rls, 'profiles')
      .update({
        social_links: socialLinksValue,
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
      const errorMessage = updateError.message || 'Unknown error'
      const errorCode = updateError.code || 'UNKNOWN'
      const errorDetails = updateError.details || updateError.hint || ''
      
      console.error('[PROFILE/SOCIAL_LINKS] Update error:', {
        message: errorMessage,
        code: errorCode,
        details: errorDetails,
        fullError: updateError,
      })
      
      Sentry.captureException(updateError, { 
        tags: { operation: 'updateSocialLinks' },
        extra: { errorMessage, errorCode, errorDetails },
      })
      
      return fail(500, 'UPDATE_FAILED', `Failed to update social links: ${errorMessage}`, {
        supabase: errorMessage,
        code: errorCode,
        details: errorDetails,
      })
    }

    return ok({ data: { social_links: updatedProfile?.social_links || normalizedLinks } })
  } catch (e: any) {
    const errorMessage = e?.message || 'Unknown error'
    const errorStack = e?.stack || ''
    const errorString = e ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : 'No error object'
    
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PROFILE/SOCIAL_LINKS] Unexpected error:', errorMessage, errorStack || '', errorString)
    }
    
    Sentry.captureException(e, { 
      tags: { operation: 'updateSocialLinks' },
      extra: { errorMessage, errorStack },
    })
    
    return fail(500, 'INTERNAL_ERROR', errorMessage)
  }
}

