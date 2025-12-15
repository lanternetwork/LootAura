/**
 * GET /api/promotions/status?sale_ids=<comma-separated>
 *
 * Returns minimal promotion status for the caller's sales (owner-only, admin allowed).
 * Shape: [{ sale_id, is_active, ends_at, tier }]
 *
 * Security:
 * - Auth required
 * - Owners only (owner_profile_id === user.id), unless admin
 * - No recipient metrics, no PII logs
 */

import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export const dynamic = 'force-dynamic'

const MAX_SALE_IDS = 100
// Defensive cap to avoid abuse with extremely long querystrings
const MAX_SALE_IDS_PARAM_LENGTH = 4000

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    const url = new URL(request.url)
    const saleIdsParam = url.searchParams.get('sale_ids')
    if (!saleIdsParam) {
      return fail(400, 'INVALID_REQUEST', 'Invalid promotion status request')
    }

    if (saleIdsParam.length > MAX_SALE_IDS_PARAM_LENGTH) {
      return fail(400, 'INVALID_REQUEST', 'Invalid promotion status request')
    }

    const rawIds = saleIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    // Deduplicate and enforce small cap to avoid abuse
    const saleIds = Array.from(new Set(rawIds)).slice(0, MAX_SALE_IDS)
    if (saleIds.length === 0) {
      return ok({ statuses: [] })
    }

    const adminDb = getAdminDb()

    // Determine if caller is admin
    let isAdmin = false
    try {
      await assertAdminOrThrow(request)
      isAdmin = true
    } catch {
      isAdmin = false
    }

    const now = new Date().toISOString()

    // Query promotions for these sale IDs
    let query = fromBase(adminDb, 'promotions')
      .select('sale_id, status, tier, ends_at, owner_profile_id')
      .in('sale_id', saleIds)

    if (!isAdmin) {
      // Restrict to caller's own promotions (non-admins cannot see other owners)
      query = query.eq('owner_profile_id', user.id)
    }

    const { data: promotions, error } = await query

    if (error) {
      logger.error(
        'Failed to query promotions for status',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'promotions/status',
          operation: 'fetch_status',
        }
      )
      return fail(500, 'DATABASE_ERROR', 'Failed to fetch promotion status')
    }

    const statuses = (promotions || []).map((p) => {
      const isActive =
        p.status === 'active' &&
        typeof p.ends_at === 'string' &&
        p.ends_at > now

      return {
        sale_id: p.sale_id,
        is_active: isActive,
        ends_at: p.ends_at,
        tier: p.tier,
      }
    })

    return ok({ statuses })
  } catch (error) {
    logger.error(
      'Unexpected error in promotions status handler',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'promotions/status',
        operation: 'GET',
      }
    )
    return fail(500, 'INTERNAL_ERROR', 'Internal server error')
  }
}



