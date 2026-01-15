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
      const now = new Date()
      const startDate = new Date(now)
      startDate.setUTCHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setUTCDate(endDate.getUTCDate() + 7)
      
      finalStartsAt = startDate.toISOString()
      finalEndsAt = endDate.toISOString()
    }

    // Validate ends_at > starts_at
    if (new Date(finalEndsAt) <= new Date(finalStartsAt)) {
      return NextResponse.json(
        { error: 'ends_at must be after starts_at' },
        { status: 400 }
      )
    }

    // Check if promotion already exists for this sale
    const { data: existingPromotion, error: existingError } = await fromBase(adminDb, 'promotions')
      .select('id, status')
      .eq('sale_id', sale_id)
      .maybeSingle()

    if (existingError && existingError.code !== 'PGRST116') { // PGRST116 = not found, which is OK
      logger.error('Error checking existing promotion', existingError instanceof Error ? existingError : new Error(String(existingError)), {
        component: 'admin/promotions',
        operation: 'activate_test',
        sale_id,
      })
      return NextResponse.json(
        { error: 'Failed to check existing promotion' },
        { status: 500 }
      )
    }

    let promotionId: string
    let promotion: any

    if (existingPromotion) {
      // Update existing promotion
      const { data: updatedPromotion, error: updateError } = await fromBase(adminDb, 'promotions')
        .update({
          status: 'active',
          starts_at: finalStartsAt,
          ends_at: finalEndsAt,
          tier,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPromotion.id)
        .select('id, sale_id, status, starts_at, ends_at, tier')
        .single()

      if (updateError || !updatedPromotion) {
        logger.error('Failed to update promotion', updateError instanceof Error ? updateError : new Error(String(updateError)), {
          component: 'admin/promotions',
          operation: 'activate_test',
          sale_id,
          promotion_id: existingPromotion.id,
        })
        return NextResponse.json(
          { error: 'Failed to update promotion' },
          { status: 500 }
        )
      }

      promotion = updatedPromotion
      promotionId = updatedPromotion.id
    } else {
      // Create new promotion
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

      promotion = newPromotion
      promotionId = newPromotion.id
    }

    logger.info('Test promotion activated', {
      component: 'admin/promotions',
      operation: 'activate_test',
      sale_id,
      promotion_id: promotionId,
      adminEmail: user.email,
      mode,
      starts_at: finalStartsAt,
      ends_at: finalEndsAt,
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
