// Admin-only endpoint for locking/unlocking user accounts

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const LockUserSchema = z.object({
  locked: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
})

async function lockUserHandler(request: NextRequest, { params }: { params: { id: string } }) {
  let user: { id: string; email?: string }
  try {
    // Require admin access
    const adminResult = await assertAdminOrThrow(request)
    user = adminResult.user
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    )
  }

  try {
    const userId = params.id

    // Parse and validate request body
    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const validationResult = LockUserSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { locked, reason } = validationResult.data

    const adminDb = getAdminDb()

    // Update profile lock fields
    const updateData: any = {
      is_locked: locked,
      locked_at: locked ? new Date().toISOString() : null,
      locked_by: locked ? (user.email || 'admin') : null,
      lock_reason: locked ? (reason || null) : null,
    }

    const { error: updateError } = await fromBase(adminDb, 'profiles')
      .update(updateData)
      .eq('id', userId)

    if (updateError) {
      logger.error('Failed to update user lock status', updateError instanceof Error ? updateError : new Error(String(updateError)), {
        component: 'moderation',
        operation: 'lock_account',
        userId,
        locked,
        adminEmail: user.email,
      })
      return NextResponse.json(
        { error: 'Failed to update user lock status' },
        { status: 500 }
      )
    }

    logger.info('User account lock status updated', {
      component: 'moderation',
      operation: 'lock_account',
      userId,
      locked,
      adminEmail: user.email,
      hasReason: !!reason,
    })

    return NextResponse.json({
      ok: true,
      data: {
        userId,
        locked,
        lockedAt: updateData.locked_at,
        lockedBy: updateData.locked_by,
      },
    })
  } catch (error) {
    logger.error('Unexpected error in lockUserHandler', error instanceof Error ? error : new Error(String(error)), {
      component: 'moderation',
      operation: 'lock_account',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withRateLimit(
    (req) => lockUserHandler(req, { params }),
    [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY],
    {}
  )(request)
}

