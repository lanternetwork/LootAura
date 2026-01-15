/**
 * Admin-only endpoint for deactivating test promotions
 * POST /api/admin/promotions/deactivate-test
 * 
 * Expires active promotions for a sale (sets status='expired' and/or ends_at=now).
 * Does NOT call Stripe or process refunds.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const DeactivateTestPromotionSchema = z.object({
  sale_id: z.string().uuid('sale_id must be a valid UUID'),
})

async function deactivateTestPromotionHandler(request: NextRequest) {
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

  // Require ENABLE_ADMIN_TOOLS flag (allow in debug mode for development/preview)
  const isDebugMode = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEBUG === 'true'
  if (process.env.ENABLE_ADMIN_TOOLS !== 'true' && !isDebugMode) {
    return NextResponse.json(
      { error: 'Admin tools are not enabled. Set ENABLE_ADMIN_TOOLS=true to use this endpoint.' },
      { status: 403 }
    )
  }

  try {
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

    const validationResult = DeactivateTestPromotionSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { sale_id } = validationResult.data

    const adminDb = getAdminDb()

    // Verify sale exists
    const { data: sale, error: saleError } = await fromBase(adminDb, 'sales')
      .select('id')
      .eq('id', sale_id)
      .single()

    if (saleError || !sale) {
      logger.warn('Sale not found for test promotion deactivation', {
        component: 'admin/promotions',
        operation: 'deactivate_test',
        sale_id,
        adminEmail: user.email,
        error: saleError?.message,
      })
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      )
    }

    // Find active promotions for this sale
    const { data: activePromotions, error: promotionsError } = await fromBase(adminDb, 'promotions')
      .select('id, status, ends_at')
      .eq('sale_id', sale_id)
      .eq('status', 'active')

    if (promotionsError) {
      logger.error('Error fetching active promotions', promotionsError instanceof Error ? promotionsError : new Error(String(promotionsError)), {
        component: 'admin/promotions',
        operation: 'deactivate_test',
        sale_id,
      })
      return NextResponse.json(
        { error: 'Failed to fetch promotions' },
        { status: 500 }
      )
    }

    if (!activePromotions || activePromotions.length === 0) {
      return NextResponse.json(
        { error: 'No active promotions found for this sale', code: 'NO_ACTIVE_PROMOTIONS' },
        { status: 404 }
      )
    }

    // Expire all active promotions
    const now = new Date().toISOString()
    const promotionIds = activePromotions.map(p => p.id)

    const { data: updatedPromotions, error: updateError } = await fromBase(adminDb, 'promotions')
      .update({
        status: 'expired',
        ends_at: now,
        updated_at: now,
      })
      .in('id', promotionIds)
      .select('id, sale_id, status, starts_at, ends_at, tier')

    if (updateError) {
      logger.error('Failed to expire promotions', updateError instanceof Error ? updateError : new Error(String(updateError)), {
        component: 'admin/promotions',
        operation: 'deactivate_test',
        sale_id,
        promotion_ids: promotionIds,
      })
      return NextResponse.json(
        { error: 'Failed to expire promotions' },
        { status: 500 }
      )
    }

    logger.info('Test promotions deactivated', {
      component: 'admin/promotions',
      operation: 'deactivate_test',
      sale_id,
      promotion_ids: promotionIds,
      count: updatedPromotions?.length || 0,
      adminEmail: user.email,
    })

    return NextResponse.json({
      ok: true,
      promotions: updatedPromotions || [],
      count: updatedPromotions?.length || 0,
    })
  } catch (error) {
    logger.error('Unexpected error in deactivateTestPromotionHandler', error instanceof Error ? error : new Error(String(error)), {
      component: 'admin/promotions',
      operation: 'deactivate_test',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return withRateLimit(
    deactivateTestPromotionHandler,
    [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY],
    {}
  )(request)
}
