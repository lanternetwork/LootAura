/**
 * DEPRECATED: Create Stripe Checkout Session for Promotion
 * POST /api/promotions/checkout
 * 
 * ⚠️ This route is deprecated and will be removed in a future version.
 * Use the new Stripe Elements flow via /promotions/checkout page instead.
 * 
 * This route is kept temporarily for backward compatibility with existing
 * Checkout Sessions that may still be in progress. New promotion flows
 * should use /api/promotions/intent with the Elements checkout page.
 * 
 * The webhook handler still processes checkout.session.completed events
 * for any existing Checkout Sessions that were created before migration.
 * 
 * @deprecated Use /promotions/checkout page with /api/promotions/intent instead
 */

import { NextRequest } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { fail } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

async function checkoutHandler(_request: NextRequest) {
  // Return 410 Gone for deprecated endpoint
  // Webhook handler still processes checkout.session.completed for existing sessions
  return fail(410, 'DEPRECATED', 'This endpoint is deprecated. Please use /promotions/checkout page with Stripe Elements instead.', {
    message: 'The Checkout Session flow has been replaced with Stripe Elements. Navigate to /promotions/checkout?mode=sale&sale_id=<id>&tier=featured_week',
    migrationGuide: 'See /docs/promotion-payments.md for details',
  })
}

export const POST = withRateLimit(checkoutHandler, [Policies.MUTATE_MINUTE])
