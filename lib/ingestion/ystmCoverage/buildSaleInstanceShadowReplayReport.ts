import {
  compareShadowSaleInstanceDecisions,
  type ShadowIngestedRowSnapshot,
} from '@/lib/ingestion/identity/shadowSaleInstanceReplay'
import { persistSaleInstanceShadowReplays } from '@/lib/ingestion/ystmCoverage/persistSaleInstanceShadowReplay'
import {
  SALE_INSTANCE_SHADOW_REPLAY_SAMPLE_LIMIT,
  type SaleInstanceShadowReplayReport,
  type SaleInstanceShadowReplayRow,
} from '@/lib/ingestion/ystmCoverage/saleInstanceShadowReplayTypes'
import { fromBase, type getAdminDb } from '@/lib/supabase/clients'
import type { DiagnosticsWriteCounter } from '@/lib/admin/diagnostics/v4/performance/writeCounter'
import { elapsedMs } from '@/lib/admin/diagnostics/v4/performance/timing'

type MissingObservationRow = {
  canonical_url: string
  state: string | null
  city: string | null
}

async function loadExtendedIngestedByUrls(
  admin: ReturnType<typeof getAdminDb>,
  urls: string[]
): Promise<Map<string, ShadowIngestedRowSnapshot>> {
  const map = new Map<string, ShadowIngestedRowSnapshot>()
  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const slice = urls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, status, failure_reasons, date_start, date_end, normalized_address, lat, lng, source_listing_id, sale_instance_key, source_content_hash, superseded_by_ingested_sale_id'
      )
      .in('source_url', slice)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const r = row as ShadowIngestedRowSnapshot
      map.set(r.source_url, r)
    }
  }
  return map
}

/**
 * Phase 9: replay every missing valid YSTM URL through legacy URL gate vs new classifier.
 */
export type ShadowReplayPerformanceSink = {
  computeDurationMs: number
  persistDurationMs: number
}

export async function buildSaleInstanceShadowReplayReport(
  admin: ReturnType<typeof getAdminDb>,
  missingRows: readonly MissingObservationRow[],
  now: Date = new Date(),
  options?: {
    writeCounter?: DiagnosticsWriteCounter
    performance?: ShadowReplayPerformanceSink
  }
): Promise<SaleInstanceShadowReplayReport> {
  const nowIso = now.toISOString()
  const urls = missingRows.map((r) => r.canonical_url)
  const computeStart = performance.now()
  const ingestedByUrl = await loadExtendedIngestedByUrls(admin, urls)

  const replayRows: SaleInstanceShadowReplayRow[] = []
  let oldSuppressCount = 0
  let newSuppressCount = 0
  let wouldPublishCount = 0
  let divergenceOldSuppressNewPublishCount = 0
  let ambiguousCount = 0

  for (const row of missingRows) {
    const ingested = ingestedByUrl.get(row.canonical_url) ?? null
    const listingSeed = {
      sourcePlatform: 'external_page_source',
      sourceUrl: row.canonical_url,
      state: row.state,
      city: row.city,
      normalizedAddress: ingested?.normalized_address ?? null,
      dateStart: ingested?.date_start ?? null,
      dateEnd: ingested?.date_end ?? null,
      lat: ingested?.lat ?? null,
      lng: ingested?.lng ?? null,
    }
    const comparison = compareShadowSaleInstanceDecisions(listingSeed, ingested)

    if (comparison.oldWouldSuppress) oldSuppressCount += 1
    if (comparison.newWouldSuppress) newSuppressCount += 1
    if (comparison.wouldPublish) wouldPublishCount += 1
    if (comparison.divergenceKind === 'old_suppress_new_publish') {
      divergenceOldSuppressNewPublishCount += 1
    }
    if (comparison.newDecision === 'ambiguous_requires_review') ambiguousCount += 1

    replayRows.push({
      canonicalUrl: row.canonical_url,
      state: row.state,
      city: row.city,
      replayedAt: nowIso,
      comparison,
      ingestedSaleId: ingested?.id ?? null,
    })
  }

  const computeDurationMs = elapsedMs(computeStart)
  const persistStart = performance.now()
  await persistSaleInstanceShadowReplays(admin, replayRows, options?.writeCounter)
  const persistDurationMs = elapsedMs(persistStart)
  if (options?.performance) {
    options.performance.computeDurationMs = computeDurationMs
    options.performance.persistDurationMs = persistDurationMs
  }

  const divergences = replayRows
    .filter((r) => r.comparison.divergenceKind === 'old_suppress_new_publish')
    .sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl))
    .slice(0, SALE_INSTANCE_SHADOW_REPLAY_SAMPLE_LIMIT)
    .map((r) => ({
      canonicalUrl: r.canonicalUrl,
      oldDecision: r.comparison.oldDecision,
      newDecision: r.comparison.newDecision,
      wouldPublish: r.comparison.wouldPublish,
      divergenceKind: r.comparison.divergenceKind,
      reasonCodes: r.comparison.reasonCodes,
    }))

  return {
    generatedAt: nowIso,
    replayedCount: replayRows.length,
    oldSuppressCount,
    newSuppressCount,
    wouldPublishCount,
    divergenceOldSuppressNewPublishCount,
    ambiguousCount,
    sampleDivergences: divergences,
  }
}
