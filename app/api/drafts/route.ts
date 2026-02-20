// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, getRlsBaseClient, fromBase } from '@/lib/supabase/clients'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'
import { ok, fail } from '@/lib/http/json'
import { computePublishability, type DraftRecord } from '@/lib/drafts/computePublishability'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

// GET: Get latest draft for authenticated user
export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    // Check if we should return all drafts, a specific draft, or just the latest
    const { searchParams } = new URL(_request.url)
    const allDrafts = searchParams.get('all') === 'true'
    const draftKey = searchParams.get('draftKey')

    if (allDrafts) {
      // Return all active drafts for user (read from base table via schema-scoped client)
      const db = await getRlsDb(_request)
      const { data: drafts, error } = await fromBase(db, 'sale_drafts')
        .select('id, draft_key, title, payload, updated_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(50)

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS/GET] supabase error:', error)
      }
      Sentry.captureException(error, { tags: { operation: 'getAllDrafts' } })
      return fail(500, 'FETCH_ERROR', 'Failed to fetch drafts', error)
    }

    // Add publishability to each draft
    const draftsWithPublishability = (drafts || []).map((draft: any) => {
      const publishability = computePublishability({
        id: draft.id,
        draft_key: draft.draft_key,
        title: draft.title,
        payload: draft.payload || { formData: {}, photos: [], items: [] },
        updated_at: draft.updated_at
      } as DraftRecord)
      return {
        ...draft,
        publishability
      }
    })

    return ok({ data: draftsWithPublishability })
    }

    // If draftKey is provided, fetch that specific draft
    if (draftKey) {
      const db = await getRlsDb(_request)
      const { data: draft, error } = await fromBase(db, 'sale_drafts')
        .select('id, draft_key, payload, updated_at')
        .eq('user_id', user.id)
        .eq('draft_key', draftKey)
        .eq('status', 'active')
        .maybeSingle()

      if (error) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[DRAFTS/GET] supabase error:', error)
        }
        Sentry.captureException(error, { tags: { operation: 'getDraftByKey' } })
        return fail(500, 'FETCH_ERROR', 'Failed to fetch draft', error)
      }

      if (!draft) {
        return ok({ data: null })
      }

      // Validate payload
      const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
      if (!validationResult.success) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[DRAFTS] Invalid draft payload:', validationResult.error)
        }
        // Return null rather than error - draft may be corrupted but don't break the flow
        return ok({ data: null })
      }

      // Compute publishability
      const publishability = computePublishability({
        id: draft.id,
        draft_key: draft.draft_key,
        payload: validationResult.data,
        updated_at: draft.updated_at
      } as DraftRecord)

      return ok({ 
        data: { 
          id: draft.id, 
          draft_key: draft.draft_key, 
          payload: validationResult.data,
          publishability
        } 
      })
    }

    // Fetch latest active draft for user (read from base table via schema-scoped client)
    const db = await getRlsDb(_request)
    const { data: draft, error } = await fromBase(db, 'sale_drafts')
      .select('id, payload, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS/GET] supabase error:', error)
      }
      Sentry.captureException(error, { tags: { operation: 'getLatestDraft' } })
      return fail(500, 'FETCH_ERROR', 'Failed to fetch draft', error)
    }

    if (!draft) {
      return ok({ data: null })
    }

    // Validate payload
    const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
    if (!validationResult.success) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS] Invalid draft payload:', validationResult.error)
      }
      // Return null rather than error - draft may be corrupted but don't break the flow
      return ok({ data: null })
    }

    // Compute publishability
    const publishability = computePublishability({
      id: draft.id,
      payload: validationResult.data,
      updated_at: draft.updated_at
    } as DraftRecord)

    return ok({ 
      data: { 
        id: draft.id, 
        payload: validationResult.data,
        publishability
      } 
    })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[DRAFTS/GET] thrown:', e)
    Sentry.captureException(e, { tags: { operation: 'getLatestDraft' } })
    return fail(500, 'INTERNAL_ERROR', e.message)
  }
}

// POST: Save or update draft
async function postDraftHandler(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    // Use getRlsBaseClient() for auth checks - this ensures we use the same client
    // that will be used for DB operations, with the session properly loaded
    const supabase = await getRlsBaseClient(request)
    
    // Get the user - session is already loaded by getRlsBaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }

    let body: any
    try {
      body = await request.json()
    } catch (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS] JSON parse error:', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }
    
    const { payload, draftKey } = body

    if (!draftKey || typeof draftKey !== 'string') {
      return fail(400, 'INVALID_INPUT', 'draftKey is required')
    }

    // Validate draft key format (UUID v4 format)
    // Prevents injection attacks and ensures data integrity
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(draftKey)) {
      return fail(400, 'INVALID_INPUT', 'draftKey must be a valid UUID format')
    }

    // Validate payload size to prevent DoS attacks
    // Estimate payload size (rough calculation)
    const payloadSize = JSON.stringify(payload).length
    const MAX_PAYLOAD_SIZE = 500 * 1024 // 500KB limit
    if (payloadSize > MAX_PAYLOAD_SIZE) {
      const { logger } = await import('@/lib/log')
      logger.warn('Draft payload too large', {
        component: 'drafts',
        operation: 'saveDraft',
        payloadSize,
        maxSize: MAX_PAYLOAD_SIZE,
        userId: user.id.substring(0, 8) + '...',
      })
      return fail(400, 'PAYLOAD_TOO_LARGE', `Draft payload exceeds maximum size of ${MAX_PAYLOAD_SIZE / 1024}KB`)
    }

    // Validate payload
    const validationResult = SaleDraftPayloadSchema.safeParse(payload)
    if (!validationResult.success) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS] Validation failed:', {
          errors: validationResult.error.issues,
          payloadKeys: payload ? Object.keys(payload) : [],
          payloadType: typeof payload,
          hasFormData: !!(payload as any)?.formData,
          formDataKeys: (payload as any)?.formData ? Object.keys((payload as any).formData) : []
        })
      }
      return fail(400, 'VALIDATION_ERROR', 'Invalid draft payload', validationResult.error)
    }

    const validatedPayload = validationResult.data
    const title = validatedPayload.formData?.title || null

    // Upsert draft (insert or update by user_id + draft_key)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[DRAFTS] Saving draft:', {
        userId: user.id,
        draftKey,
        title,
        hasPayload: !!validatedPayload,
        payloadKeys: validatedPayload ? Object.keys(validatedPayload) : [],
      })
    }
    
    // Use the same base client's schema-scoped version for DB operations
    // This ensures the session is properly propagated from the auth check
    const rls = supabase.schema('lootaura_v2')
    
    // Check if draft exists first (use RLS for reads to respect user's own drafts)
    const { data: existingDraft } = await fromBase(rls, 'sale_drafts')
      .select('id')
      .eq('user_id', user.id)
      .eq('draft_key', draftKey)
      .eq('status', 'active')
      .maybeSingle()

    let draft: any
    let error: any

    if (existingDraft) {
      // Update existing draft using RLS-aware client (sale_drafts has RLS UPDATE policy)
      const { data: updatedDraft, error: updateError } = await fromBase(rls, 'sale_drafts')
        .update({
          title,
          payload: validatedPayload,
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', existingDraft.id)
        .select('id, draft_key, title, status, updated_at')
        .single()
      draft = updatedDraft
      error = updateError
    } else {
      // Insert new draft using RLS-aware client (sale_drafts has RLS INSERT policy)
      const { data: newDraft, error: insertError } = await fromBase(rls, 'sale_drafts')
        .insert({
          user_id: user.id,
          draft_key: draftKey,
          title,
          payload: validatedPayload,
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select('id, draft_key, title, status, updated_at')
        .single()
      draft = newDraft
      error = insertError
    }

    if (error) {
      // Check for RLS/permission errors - likely auth context mismatch
      const errorCode = error?.code || error?.message || ''
      const errorMessage = String(error?.message || error || '')
      const isRlsError = /42501|PGRST301|permission denied|row-level security/i.test(String(errorCode) + ' ' + errorMessage)
      
      if (isRlsError) {
        // If getUser() succeeded but RLS denies, it's an auth context issue
        // Return 401 to prompt session refresh
        const { logger } = await import('@/lib/log')
        logger.warn('Draft save failed due to RLS/auth context mismatch', {
          component: 'drafts',
          operation: 'saveDraft',
          userId: user.id.substring(0, 8) + '...',
          errorCode: error?.code,
          errorMessage: error?.message,
        })
        return fail(401, 'AUTH_CONTEXT_INVALID', 'Your session expired. Please refresh and try again.')
      }
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS/POST] supabase error:', error)
      }
      Sentry.captureException(error, { tags: { operation: 'saveDraft' } })
      return fail(500, 'SAVE_ERROR', 'Failed to save draft', error)
    }

    if (!draft) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS] Draft save succeeded but no draft returned:', {
          draftKey,
          userId: user.id.substring(0, 8) + '...',
          operation: existingDraft ? 'update' : 'insert',
        })
      }
      return fail(500, 'NO_DATA_ERROR', 'Draft save succeeded but no data returned')
    }

    return ok({ data: { id: draft.id } })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[DRAFTS/POST] thrown:', e)
    Sentry.captureException(e, { tags: { operation: 'saveDraft' } })
    return fail(500, 'SAVE_ERROR', e.message)
  }
}

export async function POST(request: NextRequest) {
  // Get user ID for rate limiting
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  const { withRateLimit } = await import('@/lib/rateLimit/withRateLimit')
  const { Policies } = await import('@/lib/rateLimit/policies')

  return withRateLimit(
    postDraftHandler,
    [Policies.DRAFT_AUTOSAVE_MINUTE, Policies.MUTATE_DAILY],
    { userId }
  )(request)
}

// DELETE: Delete/archive draft
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Function is used as argument to withRateLimit
async function deleteDraftHandler(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }

    const { searchParams } = new URL(request.url)
    const draftKey = searchParams.get('draftKey')

    if (!draftKey) {
      return fail(400, 'INVALID_INPUT', 'draftKey is required')
    }

    // CRITICAL: Load session into the SAME client instance before using .schema()
    // This ensures the JWT is available for RLS policies when using schema-scoped client
    try {
      await supabase.auth.getSession()
    } catch {
      // Session might not exist - that's ok, caller will handle auth errors
    }
    
    // Load and explicitly set the session on the client to ensure JWT is attached
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      // Explicitly set the session to ensure JWT is in Authorization header
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    }
    
    // Use the same client instance for database operations
    // This ensures the JWT is available for RLS policies
    const rls = supabase.schema('lootaura_v2')
    const { error } = await fromBase(rls, 'sale_drafts')
      .update({ status: 'archived' })
      .eq('user_id', user.id)
      .eq('draft_key', draftKey)
      .eq('status', 'active')

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DRAFTS/DELETE] supabase error:', error)
      }
      Sentry.captureException(error, { tags: { operation: 'deleteDraft' } })
      return fail(500, 'DELETE_ERROR', 'Failed to delete draft', error)
    }

    return ok({ data: {} })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[DRAFTS/DELETE] thrown:', e)
    Sentry.captureException(e, { tags: { operation: 'deleteDraft' } })
    return fail(500, 'INTERNAL_ERROR', e.message)
  }
}

export async function DELETE(request: NextRequest) {
  // Get user ID for rate limiting
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  const { withRateLimit } = await import('@/lib/rateLimit/withRateLimit')
  const { Policies } = await import('@/lib/rateLimit/policies')

  return withRateLimit(
    deleteDraftHandler,
    [Policies.MUTATE_MINUTE, Policies.MUTATE_DAILY],
    { userId }
  )(request)
}

