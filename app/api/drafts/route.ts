// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

// API Response type
type ApiResponse<T = any> = {
  ok: boolean
  data?: T
  error?: string
  code?: string
  details?: string
}

// GET: Get latest draft for authenticated user
export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, { status: 401 })
    }

    // Check if we should return all drafts or just the latest
    const { searchParams } = new URL(_request.url)
    const allDrafts = searchParams.get('all') === 'true'

    if (allDrafts) {
      // Return all active drafts for user (read from base table via schema-scoped client)
      const db = getRlsDb()
      const { data: drafts, error } = await fromBase(db, 'sale_drafts')
        .select('id, draft_key, title, payload, updated_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('[DRAFTS] Error fetching drafts:', error)
        Sentry.captureException(error, { tags: { operation: 'getAllDrafts' } })
        return NextResponse.json<ApiResponse>({
          ok: false,
          error: 'Failed to fetch drafts',
          code: 'FETCH_ERROR'
        }, { status: 500 })
      }

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: drafts || []
      })
    }

    // Fetch latest active draft for user (read from base table via schema-scoped client)
    const db = getRlsDb()
    const { data: draft, error } = await fromBase(db, 'sale_drafts')
      .select('id, payload, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[DRAFTS] Error fetching draft:', error)
      Sentry.captureException(error, { tags: { operation: 'getLatestDraft' } })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Failed to fetch draft',
        code: 'FETCH_ERROR'
      }, { status: 500 })
    }

    if (!draft) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: null
      })
    }

    // Validate payload
    const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
    if (!validationResult.success) {
      console.error('[DRAFTS] Invalid draft payload:', validationResult.error)
      // Return null rather than error - draft may be corrupted but don't break the flow
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: null
      })
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        id: draft.id,
        payload: validationResult.data
      }
    })
  } catch (error) {
    console.error('[DRAFTS] Unexpected error in GET:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error,
      fullError: error
    })
    Sentry.captureException(error, { tags: { operation: 'getLatestDraft' } })
    return NextResponse.json<ApiResponse>({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

// POST: Save or update draft
export async function POST(request: NextRequest) {
  try {
    const { createSupabaseWriteClient } = await import('@/lib/supabase/server')
    const supabase = createSupabaseWriteClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, { status: 401 })
    }

    let body: any
    try {
      body = await request.json()
    } catch (error) {
      console.error('[DRAFTS] JSON parse error:', {
        error: error instanceof Error ? error.message : String(error)
      })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON'
      }, { status: 400 })
    }
    
    const { payload, draftKey } = body

    if (!draftKey || typeof draftKey !== 'string') {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'draftKey is required',
        code: 'INVALID_INPUT'
      }, { status: 400 })
    }

    // Validate payload
    const validationResult = SaleDraftPayloadSchema.safeParse(payload)
    if (!validationResult.success) {
      console.error('[DRAFTS] Validation failed:', {
        errors: validationResult.error.issues,
        payloadKeys: payload ? Object.keys(payload) : [],
        payloadType: typeof payload,
        hasFormData: !!(payload as any)?.formData,
        formDataKeys: (payload as any)?.formData ? Object.keys((payload as any).formData) : []
      })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Invalid draft payload',
        code: 'VALIDATION_ERROR',
        data: validationResult.error.issues,
        details: validationResult.error.message
      }, { status: 400 })
    }

    const validatedPayload = validationResult.data
    const title = validatedPayload.formData?.title || null

    // Upsert draft (insert or update by user_id + draft_key)
    console.log('[DRAFTS] Saving draft:', {
      userId: user.id,
      draftKey,
      title,
      hasPayload: !!validatedPayload,
      payloadKeys: validatedPayload ? Object.keys(validatedPayload) : [],
    })
    
    // Get schema-scoped client for writes to base table
    const db = getRlsDb()
    
    // Check if draft exists first
    const { data: existingDraft } = await fromBase(db, 'sale_drafts')
      .select('id')
      .eq('user_id', user.id)
      .eq('draft_key', draftKey)
      .eq('status', 'active')
      .maybeSingle()

    let draft: any
    let error: any

    if (existingDraft) {
      // Update existing draft - write to base table using schema-scoped client
      const { data: updatedDraft, error: updateError } = await fromBase(db, 'sale_drafts')
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
      // Insert new draft - write to base table using schema-scoped client
      const { data: newDraft, error: insertError } = await fromBase(db, 'sale_drafts')
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
      const errorDetails = {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        draftKey,
        userId: user.id,
        operation: existingDraft ? 'update' : 'insert',
        fullError: error
      }
      console.error('[DRAFTS] Error saving draft:', errorDetails)
      Sentry.captureException(error, { tags: { operation: 'saveDraft' } })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Failed to save draft',
        code: 'SAVE_ERROR',
        details: error.message || error.details || error.hint || 'Unknown database error'
      }, { status: 500 })
    }

    if (!draft) {
      console.error('[DRAFTS] Draft save succeeded but no draft returned:', {
        draftKey,
        userId: user.id,
        operation: existingDraft ? 'update' : 'insert',
      })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Draft save succeeded but no data returned',
        code: 'NO_DATA_ERROR'
      }, { status: 500 })
    }

    console.log('[DRAFTS] Draft saved successfully:', {
      id: draft?.id,
      draftKey: draft?.draft_key,
      title: draft?.title,
      status: draft?.status,
      updatedAt: draft?.updated_at,
    })

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { id: draft.id }
    })
  } catch (error) {
    console.error('[DRAFTS] Unexpected error in POST:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error,
      fullError: error
    })
    Sentry.captureException(error, { tags: { operation: 'saveDraft' } })
    return NextResponse.json<ApiResponse>({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

// DELETE: Delete/archive draft
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const draftKey = searchParams.get('draftKey')

    if (!draftKey) {
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'draftKey is required',
        code: 'INVALID_INPUT'
      }, { status: 400 })
    }

    // Mark draft as archived (soft delete) - write to base table using schema-scoped client
    const db = getRlsDb()
    const { error } = await fromBase(db, 'sale_drafts')
      .update({ status: 'archived' })
      .eq('user_id', user.id)
      .eq('draft_key', draftKey)
      .eq('status', 'active')

    if (error) {
      console.error('[DRAFTS] Error deleting draft:', error)
      Sentry.captureException(error, { tags: { operation: 'deleteDraft' } })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Failed to delete draft',
        code: 'DELETE_ERROR'
      }, { status: 500 })
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {}
    })
  } catch (error) {
    console.error('[DRAFTS] Unexpected error in DELETE:', error)
    Sentry.captureException(error, { tags: { operation: 'deleteDraft' } })
    return NextResponse.json<ApiResponse>({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

