/**
 * Featured Email Selection Engine
 * Server-only module for selecting 12 featured sales for weekly email
 * 
 * Selection rules:
 * - Next 7 days only
 * - Exclude recipient's own sales
 * - Exclude hidden_by_admin + archived
 * - Prioritize promoted sales (>=12 promoted → all promoted, <12 → promoted + high-view organic)
 * - Fairness rotation (least-shown promoted sales first)
 * - Deterministic seeded randomness
 */

import { getAdminDb, fromBase } from '@/lib/supabase/clients'

export interface FeaturedSelectionResult {
  selectedSales: string[] // Array of sale IDs
  totalPromoted: number
  totalOrganic: number
}

export interface FeaturedSelectionParams {
  recipientProfileId: string
  primaryZip: string | null
  now: Date
  weekKey: string // e.g., "2025-W03" or "2025-01-16"
  radiusKm?: number // Default: 50km
}

/**
 * Generate week key from date (ISO week format: "2025-W03" or date-based: "2025-01-16")
 */
export function getWeekKey(date: Date): string {
  // Use ISO week format for consistency
  const year = date.getFullYear()
  const week = getISOWeek(date)
  return `${year}-W${week.toString().padStart(2, '0')}`
}

/**
 * Get ISO week number for a date
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/**
 * Seeded shuffle for deterministic randomness
 */
function seededShuffle<T>(array: T[], seed: string): T[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.abs(hash) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    hash = (hash * 1103515245 + 12345) & 0x7fffffff // Linear congruential generator
  }
  return shuffled
}

/**
 * Get next 7 days date range (from now)
 */
function getNext7DaysRange(now: Date): { start: string; end: string } {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  end.setUTCHours(23, 59, 59, 999)

  return {
    start: start.toISOString().split('T')[0], // YYYY-MM-DD
    end: end.toISOString().split('T')[0],
  }
}

/**
 * Select 12 featured sales for a recipient
 * 
 * @param params - Selection parameters
 * @returns Array of 12 sale IDs
 */
export async function selectFeaturedSales(
  params: FeaturedSelectionParams
): Promise<FeaturedSelectionResult> {
  const {
    recipientProfileId,
    primaryZip: _primaryZip, // TODO: Use for location filtering in future
    now,
    weekKey,
    radiusKm: _radiusKm = 50, // TODO: Use for location filtering in future
  } = params

  const admin = getAdminDb()
  const dateRange = getNext7DaysRange(now)

  // Step 1: Query candidate sales within next 7 days
  // Filter: published, not archived, not hidden_by_admin, within date range
  const candidatesQuery = fromBase(admin, 'sales')
    .select('id, owner_id, lat, lng, date_start, date_end')
    .eq('status', 'published')
    .is('archived_at', null)
    .neq('moderation_status', 'hidden_by_admin')
    .gte('date_start', dateRange.start)
    .lte('date_start', dateRange.end)

  // If primary ZIP available, filter by location
  // For now, we'll fetch all and filter in memory (can be optimized later with PostGIS)
  // TODO: Use PostGIS spatial query when primary ZIP is available

  const { data: candidates, error: candidatesError } = await candidatesQuery

  if (candidatesError || !candidates || candidates.length === 0) {
    // Return empty result if no candidates
    return {
      selectedSales: [],
      totalPromoted: 0,
      totalOrganic: 0,
    }
  }

  // Step 2: Filter out recipient's own sales
  const filteredCandidates = candidates.filter(
    (sale) => sale.owner_id !== recipientProfileId
  )

  if (filteredCandidates.length === 0) {
    return {
      selectedSales: [],
      totalPromoted: 0,
      totalOrganic: 0,
    }
  }

  // Step 3: Query active promotions for candidate sales
  // Active promotion = status='active' AND now ∈ [starts_at, ends_at]
  const nowStr = now.toISOString()
  const candidateSaleIds = filteredCandidates.map((s) => s.id)
  
  let activePromotionSaleIds = new Set<string>()
  if (candidateSaleIds.length > 0) {
    const { data: activePromotions } = await fromBase(admin, 'promotions')
      .select('sale_id')
      .eq('status', 'active')
      .lte('starts_at', nowStr)
      .gte('ends_at', nowStr)
      .in('sale_id', candidateSaleIds)

    if (activePromotions) {
      activePromotionSaleIds = new Set(activePromotions.map((p) => p.sale_id))
    }
  }

  // Step 4: Separate promoted and organic sales
  // Promoted = has active promotion, Organic = no active promotion
  const promotedCandidates = filteredCandidates.filter((sale) => 
    activePromotionSaleIds.has(sale.id)
  )
  const organicCandidates = filteredCandidates.filter((sale) => 
    !activePromotionSaleIds.has(sale.id)
  )

  // Step 4: Apply fairness rotation for promoted sales
  // Query existing inclusions for this recipient/week to bias toward least-shown
  const seed = `${recipientProfileId}-${weekKey}`
  let fairnessAdjustedPromoted = promotedCandidates

  if (promotedCandidates.length > 0) {
    // Fetch inclusion counts for promoted sales
    const { data: inclusions } = await fromBase(admin, 'featured_inclusions')
      .select('sale_id, times_shown')
      .eq('recipient_profile_id', recipientProfileId)
      .eq('week_key', weekKey)
      .in(
        'sale_id',
        promotedCandidates.map((s) => s.id)
      )

    // Create map of inclusion counts
    const inclusionMap = new Map<string, number>()
    if (inclusions) {
      inclusions.forEach((inc) => {
        inclusionMap.set(inc.sale_id, inc.times_shown || 0)
      })
    }

    // Sort promoted by least-shown first, then apply seeded shuffle within same count
    fairnessAdjustedPromoted = promotedCandidates.sort((a, b) => {
      const aCount = inclusionMap.get(a.id) || 0
      const bCount = inclusionMap.get(b.id) || 0
      if (aCount !== bCount) {
        return aCount - bCount // Least-shown first
      }
      return 0 // Tie-break with seeded shuffle below
    })

    // Apply seeded shuffle for deterministic tie-breaking
    fairnessAdjustedPromoted = seededShuffle(fairnessAdjustedPromoted, seed)
  }

  // Step 5: Get view counts for organic sales (for high-view backfill)
  // Query analytics_events_v2 for view counts in last 30 days
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  const organicSaleIds = organicCandidates.map((s) => s.id)
  const viewCountsMap = new Map<string, number>()

  if (organicSaleIds.length > 0) {
    // Batch query view counts (limit to avoid query size issues)
    const batchSize = 100
    for (let i = 0; i < organicSaleIds.length; i += batchSize) {
      const batch = organicSaleIds.slice(i, i + batchSize)
      const { data: views } = await fromBase(admin, 'analytics_events_v2')
        .select('sale_id')
        .in('sale_id', batch)
        .eq('event_type', 'view')
        .gte('ts', thirtyDaysAgoStr)
        .eq('is_test', false)

      if (views) {
        views.forEach((view) => {
          const current = viewCountsMap.get(view.sale_id) || 0
          viewCountsMap.set(view.sale_id, current + 1)
        })
      }
    }
  }

  // Sort organic by view count (descending), then apply seeded shuffle
  const sortedOrganic = organicCandidates.sort((a, b) => {
    const aViews = viewCountsMap.get(a.id) || 0
    const bViews = viewCountsMap.get(b.id) || 0
    if (aViews !== bViews) {
      return bViews - aViews // Highest views first
    }
    return 0 // Tie-break with seeded shuffle
  })
  const shuffledOrganic = seededShuffle(sortedOrganic, seed)

  // Step 6: Select exactly 12 sales
  const selected: string[] = []
  let totalPromoted = 0

  // If >=12 promoted, take all 12 from promoted
  if (fairnessAdjustedPromoted.length >= 12) {
    selected.push(...fairnessAdjustedPromoted.slice(0, 12).map((s) => s.id))
    totalPromoted = 12
  } else {
    // Take all promoted, fill remainder with high-view organic
    selected.push(...fairnessAdjustedPromoted.map((s) => s.id))
    totalPromoted = fairnessAdjustedPromoted.length

    const remaining = 12 - selected.length
    if (remaining > 0 && shuffledOrganic.length > 0) {
      selected.push(...shuffledOrganic.slice(0, remaining).map((s) => s.id))
    }
  }

  // Ensure we return exactly 12 (or fewer if not enough candidates)
  const finalSelected = selected.slice(0, 12)

  return {
    selectedSales: finalSelected,
    totalPromoted,
    totalOrganic: finalSelected.length - totalPromoted,
  }
}

