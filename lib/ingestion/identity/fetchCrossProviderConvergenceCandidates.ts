import { SOFT_CANDIDATE_FETCH_DAY_RADIUS } from '@/lib/ingestion/duplicateScoring'
import type { CrossProviderConvergenceCandidate } from '@/lib/ingestion/identity/crossProviderDispositionTypes'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

function softFetchDateBounds(dateStart: string): { min: string; max: string } {
  const anchor = new Date(`${dateStart}T00:00:00.000Z`)
  const min = new Date(anchor)
  min.setUTCDate(min.getUTCDate() - SOFT_CANDIDATE_FETCH_DAY_RADIUS)
  const max = new Date(anchor)
  max.setUTCDate(max.getUTCDate() + SOFT_CANDIDATE_FETCH_DAY_RADIUS)
  return { min: min.toISOString().slice(0, 10), max: max.toISOString().slice(0, 10) }
}

/**
 * Active ingested rows that may converge with an incoming external listing (any platform).
 */
export async function fetchCrossProviderConvergenceCandidates(
  admin: ReturnType<typeof getAdminDb>,
  input: {
    normalizedAddress: string
    dateStart: string
    canonicalSaleInstanceKey: string | null
  }
): Promise<CrossProviderConvergenceCandidate[]> {
  const { min, max } = softFetchDateBounds(input.dateStart)
  const canonicalKey = input.canonicalSaleInstanceKey?.trim() || null

  let query = fromBase(admin, 'ingested_sales')
    .select(
      'id, source_platform, source_url, canonical_sale_instance_key, published_sale_id, is_duplicate, date_start, date_end, normalized_address, title, lat, lng'
    )
    .eq('normalized_address', input.normalizedAddress)
    .not('date_start', 'is', null)
    .gte('date_start', min)
    .lte('date_start', max)
    .is('superseded_by_ingested_sale_id', null)
    .order('id', { ascending: true })
    .limit(100)

  if (canonicalKey) {
    query = fromBase(admin, 'ingested_sales')
      .select(
        'id, source_platform, source_url, canonical_sale_instance_key, published_sale_id, is_duplicate, date_start, date_end, normalized_address, title, lat, lng'
      )
      .or(
        `canonical_sale_instance_key.eq.${canonicalKey},normalized_address.eq.${input.normalizedAddress}`
      )
      .not('date_start', 'is', null)
      .gte('date_start', min)
      .lte('date_start', max)
      .is('superseded_by_ingested_sale_id', null)
      .order('id', { ascending: true })
      .limit(100)
  }

  const { data, error } = await query
  if (error) {
    logger.warn('cross_provider_shadow: candidate query failed', {
      component: 'ingestion/cross_provider_shadow',
      message: error.message,
    })
    return []
  }

  return (data ?? []) as CrossProviderConvergenceCandidate[]
}
