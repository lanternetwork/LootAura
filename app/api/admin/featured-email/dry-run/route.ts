/**
 * Admin dry-run endpoint for featured email selection
 * 
 * Returns a JSON payload containing exactly 12 sales IDs for a test user context.
 * Does NOT send email. Does NOT require Stripe.
 * 
 * Protected by:
 * - Admin authentication (assertAdminOrThrow)
 * - ENABLE_DEBUG_ENDPOINTS flag (disabled by default in production)
 * 
 * NOTE: This is a temporary debug endpoint for CI synthetic E2E tests.
 * Should be removed or disabled once full featured email system is implemented.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { makeSale } from '@/tests/_helpers/factories'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/featured-email/dry-run
 * 
 * Returns 12 sales IDs for a test recipient (deterministic fixture data).
 * Safe for CI/synthetic tests - no external dependencies.
 * 
 * Query params:
 * - recipientId (optional): Test recipient ID (defaults to 'test-recipient-1')
 */
export async function GET(request: NextRequest) {
  try {
    // Check if debug endpoints are enabled
    const debugEnabled = process.env.ENABLE_DEBUG_ENDPOINTS === 'true'
    const isProduction = process.env.NODE_ENV === 'production'

    if (isProduction && !debugEnabled) {
      return NextResponse.json(
        { error: 'Debug endpoints are disabled in production' },
        { status: 403 }
      )
    }

    // Require admin access
    try {
      await assertAdminOrThrow(request)
    } catch {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      )
    }

    // Get recipient ID from query params (or use default for CI)
    const { searchParams } = new URL(request.url)
    const recipientId = searchParams.get('recipientId') || 'test-recipient-1'

    // Generate deterministic fixture data (12 sales)
    // In real implementation, this would query actual sales from DB
    // For now, return deterministic test data
    const now = new Date()
    const sales = Array.from({ length: 12 }, (_, i) => {
      const sale = makeSale({
        id: `test-sale-${i + 1}`,
        owner_id: `test-owner-${i + 1}`,
        date_start: new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        status: 'published',
        archived_at: null,
        is_featured: i < 5, // First 5 are promoted
      })
      return sale
    })

    // Return exactly 12 sales IDs
    return NextResponse.json({
      ok: true,
      recipientId,
      selectedSales: sales.map((s) => ({
        id: s.id,
        isPromoted: s.is_featured,
      })),
      count: sales.length,
      message: 'Dry-run selection completed (fixture data)',
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[FEATURED_EMAIL_DRY_RUN] Error:', { error: errorMessage })
    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    )
  }
}

