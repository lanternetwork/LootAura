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
import { fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export const dynamic = 'force-dynamic'

const MAX_SALE_IDS = 100
// Defensive cap to avoid abuse with extremely long querystrings
const MAX_SALE_IDS_PARAM_LENGTH = 4000

/**
 * Aggregates promotions by sale_id, returning one status per sale_id.
 * 
 * "Active" means: status === 'active' AND starts_at <= now AND ends_at >= now
 * 
 * For each sale_id:
 * - is_active: true if ANY active promotion exists, else false
 * - ends_at: if active, the maximum ends_at among active promotions, else null
 * - tier: tier of the active promotion with the latest ends_at (or null if none active)
 */
function aggregatePromotionStatuses(
  saleIds: string[],
  promotions: Array<{
    sale_id: string
    status: string
    tier: string | null
    starts_at: string | null
    ends_at: string | null
  }>,
  now: string
): Array<{
  sale_id: string
  is_active: boolean
  ends_at: string | null
  tier: string | null
}> {
  // Group promotions by sale_id
  const promotionsBySaleId = new Map<string, typeof promotions>()
  
  for (const promo of promotions) {
    if (!promo.sale_id) continue
    
    if (!promotionsBySaleId.has(promo.sale_id)) {
      promotionsBySaleId.set(promo.sale_id, [])
    }
    promotionsBySaleId.get(promo.sale_id)!.push(promo)
  }

  // Compute one status per sale_id that has promotions
  // Only return statuses for sale_ids that have at least one promotion (ownership is enforced by the query)
  return saleIds
    .map((saleId) => {
      const salePromotions = promotionsBySaleId.get(saleId) || []
      
      // If no promotions found for this sale_id, skip it (user doesn't own it or it has no promotions)
      if (salePromotions.length === 0) {
        return null
      }
      
      // Find all active promotions for this sale
      const activePromotions = salePromotions.filter((p) => {
        return (
          p.status === 'active' &&
          typeof p.starts_at === 'string' &&
          typeof p.ends_at === 'string' &&
          p.starts_at <= now &&
          p.ends_at >= now
        )
      })

      if (activePromotions.length === 0) {
        // No active promotion, but has promotions (inactive/expired)
        return {
          sale_id: saleId,
          is_active: false,
          ends_at: null,
          tier: null,
        }
      }

      // Find the active promotion with the latest ends_at
      // All activePromotions have ends_at (filtered above), so we can safely compare
      // Since we know activePromotions.length > 0, we can use the first as initial value
      const latestActive = activePromotions.reduce((latest, current) => {
        // Both should have ends_at at this point (filtered above), but be defensive
        if (!current.ends_at) return latest
        if (!latest.ends_at) return current
        return current.ends_at > latest.ends_at ? current : latest
      }, activePromotions[0])

      return {
        sale_id: saleId,
        is_active: true,
        ends_at: latestActive.ends_at ?? null,
        tier: latestActive.tier ?? null,
      }
    })
    .filter((status): status is NonNullable<typeof status> => status !== null)
}

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
    const uniqueIds = Array.from(new Set(rawIds))

    // Slice to MAX_SALE_IDS if more than the limit (instead of returning error)
    const saleIds = uniqueIds.slice(0, MAX_SALE_IDS)
    if (saleIds.length === 0) {
      return ok({ statuses: [] })
    }

    // CRITICAL: Load session into the SAME client instance before using .schema()
    // This ensures the JWT is available for RLS policies when using schema-scoped client
    try {
      await supabase.auth.getSession()
    } catch {
      // Session might not exist - that's ok, caller will handle auth errors
    }
    
    // Load and explicitly set the session on the client to ensure JWT is attached
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      // Explicitly set the session to ensure JWT is in Authorization header
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    }
    
    // Use the same client instance for database operations
    // This ensures the JWT is available for RLS policies
    const rls = supabase.schema('lootaura_v2')

    // Determine if caller is admin
    let isAdmin = false
    try {
      await assertAdminOrThrow(request)
      isAdmin = true
    } catch {
      isAdmin = false
    }

    const now = new Date().toISOString()

    // Query promotions for these sale IDs (include starts_at for active check)
    // RLS policies will automatically filter to user's own promotions (or all if admin)
    let query = fromBase(rls, 'promotions')
      .select('sale_id, status, tier, starts_at, ends_at, owner_profile_id')
      .in('sale_id', saleIds)

    // RLS policy promotions_owner_select already restricts to owner_profile_id = auth.uid()
    // For non-admins, RLS will automatically filter. For admins, promotions_admin_select allows all.
    // The .eq() filter below is redundant but kept for explicit clarity
    if (!isAdmin) {
      // Explicitly filter to caller's own promotions (RLS also enforces this)
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

    // Aggregate promotions by sale_id
    const statuses = aggregatePromotionStatuses(saleIds, promotions || [], now)

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



