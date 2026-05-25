import type { ExternalListDuplicateProbe } from '@/lib/ingestion/dedupe'
import { normalizeTitleForDedupe } from '@/lib/ingestion/duplicateScoring'
import { buildCrossProviderShadowIncoming } from '@/lib/ingestion/identity/buildCrossProviderShadowIncoming'
import type { CrossProviderObservationInsert } from '@/lib/ingestion/identity/crossProviderDispositionTypes'
import { isCrossProviderIngestEnforcementEnabled } from '@/lib/ingestion/identity/crossProviderShadowEnforcement'
import { fetchCrossProviderConvergenceCandidates } from '@/lib/ingestion/identity/fetchCrossProviderConvergenceCandidates'
import { resolveCrossProviderIngestDisposition } from '@/lib/ingestion/identity/resolveCrossProviderIngestDisposition'
import type { CrossProviderShadowDisposition } from '@/lib/ingestion/identity/crossProviderDispositionTypes'
import { getAdminDb } from '@/lib/supabase/clients'

const OBSERVATION_DISPOSITIONS = new Set<CrossProviderShadowDisposition>([
  'would_link_observation',
  'would_suppress_publish',
  'would_observation_review',
])

/**
 * Phase C: when enforcement is on, return duplicate-observation insert linkage for cross-provider matches.
 */
export async function evaluateCrossProviderObservationForIngest(
  platform: string,
  probe: ExternalListDuplicateProbe,
  normalizedAddress: string
): Promise<CrossProviderObservationInsert | null> {
  if (!isCrossProviderIngestEnforcementEnabled() || !probe.startDate) {
    return null
  }

  const { canonicalSaleInstanceKey } = buildCrossProviderShadowIncoming(
    platform,
    probe,
    normalizedAddress
  )

  const admin = getAdminDb()
  const candidates = await fetchCrossProviderConvergenceCandidates(admin, {
    normalizedAddress,
    dateStart: probe.startDate,
    canonicalSaleInstanceKey,
  })

  const disposition = resolveCrossProviderIngestDisposition({
    incomingPlatform: platform,
    incomingCanonicalKey: canonicalSaleInstanceKey,
    normalizedAddress,
    dateStart: probe.startDate,
    dateEnd: probe.endDate ?? null,
    normalizedTitle: normalizeTitleForDedupe(probe.title),
    lat: probe.lat ?? null,
    lng: probe.lng ?? null,
    candidates,
  })

  if (!OBSERVATION_DISPOSITIONS.has(disposition.disposition)) {
    return null
  }

  const primaryId =
    disposition.primaryIngestedSaleId ?? disposition.matchedIngestedSaleId ?? null
  if (!primaryId) {
    return null
  }

  return {
    isDuplicate: true,
    duplicateOfId: primaryId,
    primaryIngestedSaleId: primaryId,
    confidence: disposition.confidence,
    disposition: disposition.disposition,
    matchMethod: disposition.matchMethod,
    matchReasons: disposition.matchReasons,
  }
}
