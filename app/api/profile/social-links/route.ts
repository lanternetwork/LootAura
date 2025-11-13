// NOTE: Writes → lootaura_v2.* only. Reads from views allowed. Do not write to views.
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
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

    // Update profile using RPC function which uses SECURITY DEFINER to bypass RLS
    // This is more reliable than direct table updates when RLS session issues occur
    // The RPC function validates that p_user_id matches the authenticated user
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_profile', {
      p_user_id: user.id,
      p_social_links: socialLinksValue,
    })

    if (rpcError) {
      const errorMessage = rpcError.message || 'Unknown error'
      const errorCode = rpcError.code || 'UNKNOWN'
      const errorDetails = rpcError.details || rpcError.hint || ''
      
      console.error('[PROFILE/SOCIAL_LINKS] RPC update error:', {
        message: errorMessage,
        code: errorCode,
        details: errorDetails,
        fullError: rpcError,
      })
      
      Sentry.captureException(rpcError, { 
        tags: { operation: 'updateSocialLinks' },
        extra: { errorMessage, errorCode, errorDetails },
      })
      
      return fail(500, 'UPDATE_FAILED', `Failed to update social links: ${errorMessage}`, {
        supabase: errorMessage,
        code: errorCode,
        details: errorDetails,
      })
    }

    // RPC returns the updated profile as JSONB
    const updatedProfile = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult

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

