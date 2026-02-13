/**
 * Get Promotion Metrics for a Sale
 * GET /api/sales/[id]/promotion-metrics
 * 
 * Returns promotion status and featured inclusion metrics for a sale.
 * Only sale owner or admin can access.
 */

import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getInclusionRollup } from '@/lib/featured-email/inclusionTracking'
import { fail, ok } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

async function metricsHandler(request: NextRequest, { params }: { params: { id: string } }) {
  const saleId = params.id

  // Auth required
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return fail(401, 'AUTH_REQUIRED', 'Authentication required')
  }

  // Verify sale exists and get owner_id using RLS-aware client
  const { getRlsDb } = await import('@/lib/supabase/clients')
  const rls = getRlsDb()
  const { data: sale, error: saleError } = await fromBase(rls, 'sales')
    .select('id, owner_id')
    .eq('id', saleId)
    .single()

  if (saleError || !sale) {
    return fail(404, 'SALE_NOT_FOUND', 'Sale not found')
  }

  // Check if user is owner or admin
  const isOwner = sale.owner_id === user.id

  if (!isOwner) {
    // Check admin status
    try {
      await assertAdminOrThrow(request)
    } catch {
      return fail(403, 'FORBIDDEN', 'You can only view promotion metrics for your own sales')
    }
  }

  // Get current active promotion using RLS-aware client (promotions has RLS SELECT policy)
  const now = new Date().toISOString()
  const { data: activePromotion } = await fromBase(rls, 'promotions')
    .select('id, status, tier, starts_at, ends_at, amount_cents, currency')
    .eq('sale_id', saleId)
    .eq('status', 'active')
    .lte('starts_at', now)
    .gte('ends_at', now)
    .maybeSingle()

  // Get all promotions for this sale (for history) using RLS-aware client
  const { data: allPromotions } = await fromBase(rls, 'promotions')
    .select('id, status, tier, starts_at, ends_at, created_at')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false })
    .limit(10) // Last 10 promotions

  // Get inclusion rollup (aggregate metrics)
  const inclusionRollup = await getInclusionRollup(saleId)

  return ok({
    saleId,
    currentPromotion: activePromotion ? {
      id: activePromotion.id,
      status: activePromotion.status,
      tier: activePromotion.tier,
      startsAt: activePromotion.starts_at,
      endsAt: activePromotion.ends_at,
      amountCents: activePromotion.amount_cents,
      currency: activePromotion.currency,
    } : null,
    promotionHistory: allPromotions?.map((p) => ({
      id: p.id,
      status: p.status,
      tier: p.tier,
      startsAt: p.starts_at,
      endsAt: p.ends_at,
      createdAt: p.created_at,
    })) || [],
    featuredMetrics: inclusionRollup ? {
      uniqueRecipientsTotal: inclusionRollup.uniqueRecipientsTotal,
      totalInclusionsTotal: inclusionRollup.totalInclusionsTotal,
      lastFeaturedAt: inclusionRollup.lastFeaturedAt,
    } : {
      uniqueRecipientsTotal: 0,
      totalInclusionsTotal: 0,
      lastFeaturedAt: null,
    },
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withRateLimit(
    (req) => metricsHandler(req, { params }),
    [Policies.SALES_VIEW_30S]
  )(request)
}

