/**
 * Admin-only endpoint for activating test promotions (no Stripe)
 * POST /api/admin/promotions/activate-test
 * 
 * Creates or updates a promotion record to 'active' status for UX testing.
 * Does NOT call Stripe or create payment records.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const ActivateTestPromotionSchema = z.object({
  sale_id: z.string().uuid('sale_id must be a valid UUID'),
  mode: z.enum(['seven_days_before_start', 'now_plus_7', 'custom']).optional().default('now_plus_7'),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  tier: z.enum(['featured_week']).optional().default('featured_week'),
})

async function activateTestPromotionHandler(request: NextRequest) {
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
  // Since assertAdminOrThrow already passed, this is just a safety flag
  const isDebugMode = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEBUG === 'true'
  const adminToolsValue = process.env.ENABLE_ADMIN_TOOLS?.trim().toLowerCase()
  // Only block if explicitly disabled in production (or if not set in production)
  // In non-production, allow unless explicitly set to 'false'
  const isExplicitlyDisabled = adminToolsValue === 'false' || adminToolsValue === '0' || adminToolsValue === 'no'
  const isExplicitlyEnabled = adminToolsValue === 'true' || adminToolsValue === '1' || adminToolsValue === 'yes'
  if (!isDebugMode && (isExplicitlyDisabled || (process.env.NODE_ENV === 'production' && !isExplicitlyEnabled))) {
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

    const validationResult = ActivateTestPromotionSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { sale_id, mode, starts_at, ends_at, tier } = validationResult.data

    const adminDb = getAdminDb()

    // Verify sale exists and is published
    const { data: sale, error: saleError } = await fromBase(adminDb, 'sales')
      .select('id, owner_id, status, date_start')
      .eq('id', sale_id)
      .single()

    if (saleError || !sale) {
      logger.warn('Sale not found for test promotion activation', {
        component: 'admin/promotions',
        operation: 'activate_test',
        sale_id,
        adminEmail: user.email,
        error: saleError?.message,
      })
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      )
    }

    // Verify sale is published
    if (sale.status !== 'published' && sale.status !== 'active') {
      return NextResponse.json(
        { error: 'Sale must be published or active to promote', code: 'SALE_NOT_ELIGIBLE' },
        { status: 400 }
      )
    }

    // Calculate starts_at and ends_at based on mode
    let finalStartsAt: string
    let finalEndsAt: string

    if (mode === 'custom') {
      if (!starts_at || !ends_at) {
        return NextResponse.json(
          { error: 'starts_at and ends_at are required when mode is "custom"' },
          { status: 400 }
        )
      }
      finalStartsAt = starts_at
      finalEndsAt = ends_at
    } else if (mode === 'seven_days_before_start') {
      if (!sale.date_start) {
        return NextResponse.json(
          { error: 'Sale must have date_start to use "seven_days_before_start" mode' },
          { status: 400 }
        )
      }
      // Start 7 days before sale date_start, end 7 days after start (14-day window ending when sale starts)
      const saleStartDate = new Date(sale.date_start)
      saleStartDate.setUTCHours(0, 0, 0, 0)
      const promotionStart = new Date(saleStartDate)
      promotionStart.setUTCDate(promotionStart.getUTCDate() - 7)
      const promotionEnd = new Date(saleStartDate)
      promotionEnd.setUTCDate(promotionEnd.getUTCDate() + 7)
      
      finalStartsAt = promotionStart.toISOString()
      finalEndsAt = promotionEnd.toISOString()
    } else {
      // mode === 'now_plus_7' (default)
      // Start immediately (now) and end 7 days from now
      const now = new Date()
      const endDate = new Date(now)
      endDate.setUTCDate(endDate.getUTCDate() + 7)
      
      finalStartsAt = now.toISOString()
      finalEndsAt = endDate.toISOString()
    }

    // Validate ends_at > starts_at
    if (new Date(finalEndsAt) <= new Date(finalStartsAt)) {
      return NextResponse.json(
        { error: 'ends_at must be after starts_at' },
        { status: 400 }
      )
    }

    // Find all live promotions for this sale (active or pending)
    // We'll expire them all before creating/updating the test promotion
    const { data: existingPromotions, error: existingError } = await fromBase(adminDb, 'promotions')
      .select('id, status')
      .eq('sale_id', sale_id)
      .in('status', ['active', 'pending'])

    if (existingError) {
      logger.error('Error checking existing promotions', existingError instanceof Error ? existingError : new Error(String(existingError)), {
        component: 'admin/promotions',
        operation: 'activate_test',
        sale_id,
      })
      return NextResponse.json(
        { error: 'Failed to check existing promotions' },
        { status: 500 }
      )
    }

    // Expire all existing live promotions (idempotent: if none exist, this is a no-op)
    if (existingPromotions && existingPromotions.length > 0) {
      const now = new Date().toISOString()
      const promotionIds = existingPromotions.map((p) => p.id)

      const { error: expireError } = await fromBase(adminDb, 'promotions')
        .update({
          status: 'expired',
          ends_at: now,
          updated_at: now,
        })
        .in('id', promotionIds)
        .in('status', ['active', 'pending']) // Only expire if still active/pending (idempotent)

      if (expireError) {
        logger.error('Failed to expire existing promotions', expireError instanceof Error ? expireError : new Error(String(expireError)), {
          component: 'admin/promotions',
          operation: 'activate_test',
          sale_id,
          promotion_ids: promotionIds,
        })
        return NextResponse.json(
          { error: 'Failed to expire existing promotions' },
          { status: 500 }
        )
      }

      logger.info('Expired existing promotions before activating test promotion', {
        component: 'admin/promotions',
        operation: 'activate_test',
        sale_id,
        expired_count: promotionIds.length,
        promotion_ids: promotionIds,
      })
    }

    // Create new test promotion (always create, never update, since we expired all existing ones)
    const { data: newPromotion, error: createError } = await fromBase(adminDb, 'promotions')
      .insert({
        sale_id,
        owner_profile_id: sale.owner_id,
        status: 'active',
        tier,
        starts_at: finalStartsAt,
        ends_at: finalEndsAt,
        amount_cents: 0, // Test promotion - no payment
        currency: 'usd',
      })
      .select('id, sale_id, status, starts_at, ends_at, tier')
      .single()

    if (createError || !newPromotion) {
      logger.error('Failed to create promotion', createError instanceof Error ? createError : new Error(String(createError)), {
        component: 'admin/promotions',
        operation: 'activate_test',
        sale_id,
      })
      return NextResponse.json(
        { error: 'Failed to create promotion' },
        { status: 500 }
      )
    }

    const promotion = newPromotion
    const promotionId = newPromotion.id

    logger.info('Test promotion activated', {
      component: 'admin/promotions',
      operation: 'activate_test',
      sale_id,
      promotion_id: promotionId,
      adminEmail: user.email,
      mode,
      starts_at: finalStartsAt,
      ends_at: finalEndsAt,
      expired_existing_count: existingPromotions?.length || 0,
    })

    return NextResponse.json({
      ok: true,
      promotion: {
        id: promotion.id,
        sale_id: promotion.sale_id,
        status: promotion.status,
        starts_at: promotion.starts_at,
        ends_at: promotion.ends_at,
        tier: promotion.tier,
      },
    })
  } catch (error) {
    logger.error('Unexpected error in activateTestPromotionHandler', error instanceof Error ? error : new Error(String(error)), {
      component: 'admin/promotions',
      operation: 'activate_test',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return withRateLimit(
    activateTestPromotionHandler,
    [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY],
    {}
  )(request)
}
