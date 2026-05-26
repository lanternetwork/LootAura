import type { ExternalListDuplicateSkipResult, ExternalListDuplicateProbe } from '@/lib/ingestion/dedupe'
import { buildCrossProviderShadowIncoming } from '@/lib/ingestion/identity/buildCrossProviderShadowIncoming'
import { isCrossProviderShadowEnabled } from '@/lib/ingestion/identity/crossProviderShadowEnforcement'
import { fetchCrossProviderConvergenceCandidates } from '@/lib/ingestion/identity/fetchCrossProviderConvergenceCandidates'
import { resolveCrossProviderIngestDisposition } from '@/lib/ingestion/identity/resolveCrossProviderIngestDisposition'
import { recordCrossProviderShadowDisposition } from '@/lib/ingestion/identity/recordCrossProviderShadowDisposition'
import { normalizeTitleForDedupe } from '@/lib/ingestion/duplicateScoring'
import { EXTERNAL_INGEST_PLATFORMS } from '@/lib/ingestion/identity/backfillCanonicalSaleInstanceKey'
import { getAdminDb } from '@/lib/supabase/clients'

const EXTERNAL_PLATFORMS = new Set<string>(EXTERNAL_INGEST_PLATFORMS)

/**
 * Phase B: record shadow cross-provider disposition on external list/detail ingest paths.
 * No change to skip/insert/publish behavior.
 */
export async function maybeRecordCrossProviderShadowOnExternalIngest(
  platform: string,
  probe: ExternalListDuplicateProbe,
  duplicateResult: ExternalListDuplicateSkipResult,
  context: string
): Promise<void> {
  if (!isCrossProviderShadowEnabled() || !EXTERNAL_PLATFORMS.has(platform)) return

  const normalizedAddress = probe.addressRaw
    ? probe.addressRaw.toLowerCase().replace(/\s+/g, ' ').trim()
    : null
  if (!normalizedAddress || !probe.startDate) return

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

  await recordCrossProviderShadowDisposition(admin, {
    sourceUrl: probe.sourceUrl,
    sourcePlatform: platform,
    incomingCanonicalKey: canonicalSaleInstanceKey,
    currentWouldSoftSkip: duplicateResult.skip,
    context,
    disposition,
  })
}
