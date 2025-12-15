/**
 * Admin dry-run endpoint for featured email selection
 * 
 * Returns a JSON payload containing exactly 12 sales IDs for a test user context.
 * Does NOT send email. Does NOT require Stripe.
 * 
 * Protected by:
 * - Admin authentication (assertAdminOrThrow) OR
 * - CI secret header (X-LootAura-DryRun-Secret) when ENABLE_DEBUG_ENDPOINTS=true
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
 * 
 * Access methods:
 * - Admin auth: Requires admin authentication (for Owner manual testing)
 * - CI secret header: X-LootAura-DryRun-Secret (for CI synthetic E2E tests)
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

    // Check for CI secret header access path
    const ciSecret = process.env.FEATURED_EMAIL_DRYRUN_SECRET
    const providedSecret = request.headers.get('X-LootAura-DryRun-Secret')

    let isAuthorized = false

    // Path 1: CI secret header (only when ENABLE_DEBUG_ENDPOINTS=true and secret is configured)
    if (debugEnabled && ciSecret && providedSecret) {
      // Use constant-time comparison to prevent timing attacks
      // Always compare full length to prevent length-based timing leaks
      const maxLength = Math.max(ciSecret.length, providedSecret.length)
      let match = true
      for (let i = 0; i < maxLength; i++) {
        const secretChar = i < ciSecret.length ? ciSecret[i] : ''
        const providedChar = i < providedSecret.length ? providedSecret[i] : ''
        if (secretChar !== providedChar) {
          match = false
        }
      }
      if (match && ciSecret.length === providedSecret.length) {
        isAuthorized = true
      }
    }

    // Path 2: Admin authentication (for Owner manual testing)
    if (!isAuthorized) {
      try {
        await assertAdminOrThrow(request)
        isAuthorized = true
      } catch {
        // Admin auth failed, continue to check if CI secret was provided
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access or valid CI secret required' },
        { status: 403 }
      )
    }

    // Get recipient ID from query params (or use default for CI)
    // Note: recipientId is not used in fixture generation but kept for API consistency
    const { searchParams } = new URL(request.url)
    const _recipientId = searchParams.get('recipientId') || 'test-recipient-1'

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

    // Return exactly 12 sales IDs (no PII - IDs only)
    return NextResponse.json({
      ok: true,
      count: sales.length,
      selectedSales: sales.map((s) => s.id),
      source: 'fixture',
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    // Log error without exposing secrets or headers
    console.error('[FEATURED_EMAIL_DRY_RUN] Error:', { error: errorMessage })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

