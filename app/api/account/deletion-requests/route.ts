import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

// Validation schema
const DeletionRequestSchema = z.object({
  reason: z.string().trim().max(500, 'Reason must be 500 characters or less').optional().or(z.literal('')),
  confirmed: z.boolean().refine(val => val === true, {
    message: 'You must confirm that you understand this action cannot be undone'
  })
})

// GET: Fetch user's current deletion request
async function getHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createSupabaseServerClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    // Fetch user's most recent request (prefer pending if exists)
    const db = await getRlsDb(request)
    const { data: pendingRequest } = await fromBase(db, 'account_deletion_requests')
      .select('id, status, created_at, processed_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingRequest) {
      return ok({ request: pendingRequest })
    }

    // If no pending, get most recent request
    const { data: recentRequest } = await fromBase(db, 'account_deletion_requests')
      .select('id, status, created_at, processed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return ok({ request: recentRequest || null })
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[DELETION_REQUESTS/GET] error:', error)
    }
    Sentry.captureException(error, { tags: { operation: 'getDeletionRequest' } })
    return fail(500, 'INTERNAL_ERROR', 'Failed to fetch deletion request')
  }
}

// POST: Create a new deletion request
async function postHandler(request: NextRequest): Promise<NextResponse> {
  // CSRF protection check
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    // Check if account is locked
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }

    // Parse and validate request body
    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }

    const validationResult = DeletionRequestSchema.safeParse(body)
    if (!validationResult.success) {
      return fail(400, 'INVALID_INPUT', 'Invalid request data', {
        details: validationResult.error.issues
      })
    }

    const { reason, confirmed } = validationResult.data

    // Check for existing pending request
    const db = await getRlsDb(request)
    const { data: existingPending } = await fromBase(db, 'account_deletion_requests')
      .select('id, status, created_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingPending) {
      return fail(409, 'ALREADY_PENDING', 'You already have a pending deletion request', {
        request: {
          id: existingPending.id,
          status: existingPending.status,
          created_at: existingPending.created_at
        }
      })
    }

    // Insert new deletion request
    const { data: newRequest, error: insertError } = await fromBase(db, 'account_deletion_requests')
      .insert({
        user_id: user.id,
        reason: reason && reason.trim() ? reason.trim() : null,
        status: 'pending'
      })
      .select('id, status, created_at')
      .single()

    if (insertError) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[DELETION_REQUESTS/POST] insert error:', insertError)
      }
      Sentry.captureException(insertError, { tags: { operation: 'createDeletionRequest' } })
      return fail(500, 'INSERT_ERROR', 'Failed to create deletion request')
    }

    return ok({ request: newRequest })
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[DELETION_REQUESTS/POST] error:', error)
    }
    Sentry.captureException(error, { tags: { operation: 'createDeletionRequest' } })
    return fail(500, 'INTERNAL_ERROR', 'Failed to create deletion request')
  }
}

// Export handlers with rate limiting
export const GET = getHandler
export const POST = withRateLimit(postHandler, [Policies.ACCOUNT_DELETION])
