import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { SaleDraftPayloadSchema } from '@/lib/validation/saleDraft'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

// API Response type
type ApiResponse<T = any> = {
  ok: boolean
  data?: T
  error?: string
  code?: string
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

    // Fetch latest active draft for user
    const { data: draft, error } = await supabase
      .from('lootaura_v2.sale_drafts')
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
    console.error('[DRAFTS] Unexpected error in GET:', error)
    Sentry.captureException(error, { tags: { operation: 'getLatestDraft' } })
    return NextResponse.json<ApiResponse>({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

// POST: Save or update draft
export async function POST(request: NextRequest) {
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

    const body = await request.json()
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
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Invalid draft payload',
        code: 'VALIDATION_ERROR',
        data: validationResult.error.issues
      }, { status: 400 })
    }

    const validatedPayload = validationResult.data
    const title = validatedPayload.formData?.title || null

    // Upsert draft (insert or update by user_id + draft_key)
    const { data: draft, error } = await supabase
      .from('lootaura_v2.sale_drafts')
      .upsert({
        user_id: user.id,
        draft_key: draftKey,
        title,
        payload: validatedPayload,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
      }, {
        onConflict: 'user_id,draft_key',
        ignoreDuplicates: false
      })
      .select('id')
      .single()

    if (error) {
      console.error('[DRAFTS] Error saving draft:', error)
      Sentry.captureException(error, { tags: { operation: 'saveDraft' } })
      return NextResponse.json<ApiResponse>({
        ok: false,
        error: 'Failed to save draft',
        code: 'SAVE_ERROR'
      }, { status: 500 })
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { id: draft.id }
    })
  } catch (error) {
    console.error('[DRAFTS] Unexpected error in POST:', error)
    Sentry.captureException(error, { tags: { operation: 'saveDraft' } })
    return NextResponse.json<ApiResponse>({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
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

    // Mark draft as archived (soft delete)
    const { error } = await supabase
      .from('lootaura_v2.sale_drafts')
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

