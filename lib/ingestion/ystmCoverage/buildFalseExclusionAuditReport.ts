import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { classifyFalseExclusionTrace } from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'
import {
  FALSE_EXCLUSION_TRACE_BUCKETS,
  type FalseExclusionAuditReport,
  type FalseExclusionTraceBucket,
  type FalseExclusionUrlTrace,
} from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import {
  buildObservationFootprintInput,
  loadIngestedFootprintResolverIndex,
  resolveIngestedFootprintForObservation,
} from '@/lib/ingestion/ystmCoverage/resolveIngestedFootprintForObservation'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import { persistFalseExclusionTraces } from '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const MISSING_PAGE_SIZE = 500
/** Max traces returned on scoreboard API (all missing rows are still persisted). */
export const FALSE_EXCLUSION_SCOREBOARD_TRACE_LIMIT = 120

type MissingObservationRow = {
  canonical_url: string
  state: string | null
  city: string | null
  config_key: string | null
  sale_instance_key: string | null
  source_listing_id: string | null
  matched_ingested_sale_id: string | null
  missing_ingestion_outcome: string | null
  missing_ingestion_attempted_at: string | null
  missing_ingestion_failure_reason: string | null
  missing_ingestion_replay_count: number | null
  last_detail_checked_at: string | null
  false_exclusion_primary_bucket: string | null
  list_metadata_snapshot: YstmListMetadataSale | null
}

function emptyBucketCounts(): Record<FalseExclusionTraceBucket, number> {
  return Object.fromEntries(
    FALSE_EXCLUSION_TRACE_BUCKETS.map((b) => [b, 0])
  ) as Record<FalseExclusionTraceBucket, number>
}

export async function listMissingValidObservations(
  admin: ReturnType<typeof getAdminDb>
): Promise<MissingObservationRow[]> {
  const out: MissingObservationRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select(
        'canonical_url, state, city, config_key, sale_instance_key, source_listing_id, matched_ingested_sale_id, missing_ingestion_outcome, missing_ingestion_attempted_at, missing_ingestion_failure_reason, missing_ingestion_replay_count, last_detail_checked_at, false_exclusion_primary_bucket, list_metadata_snapshot'
      )
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .order('canonical_url', { ascending: true })
      .range(from, from + MISSING_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as MissingObservationRow[]
    out.push(...chunk)
    if (chunk.length < MISSING_PAGE_SIZE) break
    from += MISSING_PAGE_SIZE
  }
  return out
}

async function loadConfigsForObservations(
  admin: ReturnType<typeof getAdminDb>,
  rows: MissingObservationRow[]
): Promise<
  Map<string, import('@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace').FalseExclusionConfigSnapshot>
> {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.city && row.state) {
      keys.add(`${row.state}|${row.city}`.toLowerCase())
    }
  }
  const map = new Map<
    string,
    import('@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace').FalseExclusionConfigSnapshot
  >()
  if (keys.size === 0) return map

  const { data, error } = await fromBase(admin, 'ingestion_city_configs')
    .select(
      'city, state, enabled, source_pages, source_crawl_excluded_at, source_crawl_last_at'
    )
    .eq('source_platform', 'external_page_source')
    .eq('enabled', true)
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const r = row as {
      city: string
      state: string
      enabled: boolean
      source_pages: unknown
      source_crawl_excluded_at: string | null
      source_crawl_last_at: string | null
    }
    const key = `${r.state}|${r.city}`.toLowerCase()
    if (!keys.has(key)) continue
    map.set(key, {
      enabled: r.enabled,
      source_pages: r.source_pages,
      source_crawl_excluded_at: r.source_crawl_excluded_at,
      source_crawl_last_at: r.source_crawl_last_at,
    })
  }
  return map
}

/**
 * Trace every missing valid YSTM URL (full set for reconciliation + persistence).
 */
export async function traceMissingValidFalseExclusions(
  admin: ReturnType<typeof getAdminDb>,
  now: Date = new Date(),
  preloadedMissingRows?: MissingObservationRow[]
): Promise<{
  generatedAt: string
  missingRows: MissingObservationRow[]
  traces: FalseExclusionUrlTrace[]
  byPrimaryBucket: Record<FalseExclusionTraceBucket, number>
}> {
  const nowIso = now.toISOString()
  const missingRows = preloadedMissingRows ?? (await listMissingValidObservations(admin))
  const [ingestedIndex, configByKey, publishedIndex] = await Promise.all([
    loadIngestedFootprintResolverIndex(admin, missingRows),
    loadConfigsForObservations(admin, missingRows),
    loadLootAuraPublishedYstmIndex(admin, now),
  ])

  const byPrimaryBucket = emptyBucketCounts()
  const traces: FalseExclusionUrlTrace[] = []

  for (const row of missingRows) {
    const configKey =
      row.config_key ?? (row.state && row.city ? `${row.state}|${row.city}` : null)
    const config =
      configKey != null ? configByKey.get(configKey.toLowerCase()) ?? null : null
    const canonical = canonicalSourceUrl(row.canonical_url)
    const classified = classifyFalseExclusionTrace({
      observation: {
        canonicalUrl: row.canonical_url,
        state: row.state,
        city: row.city,
        configKey,
        missingIngestionOutcome: row.missing_ingestion_outcome,
        missingIngestionAttemptedAt: row.missing_ingestion_attempted_at,
        missingIngestionFailureReason: row.missing_ingestion_failure_reason,
        lastDetailCheckedAt: row.last_detail_checked_at,
      },
      ingested:
        resolveIngestedFootprintForObservation(
          buildObservationFootprintInput(row),
          ingestedIndex
        )?.ingested ?? null,
      config,
      visibleInPublishedIndex: publishedIndex.visibleCanonicalUrls.has(canonical),
      nowIso,
    })

    const trace: FalseExclusionUrlTrace = {
      canonicalUrl: row.canonical_url,
      state: row.state,
      city: row.city,
      configKey,
      tracedAt: nowIso,
      ...classified,
    }
    traces.push(trace)
    byPrimaryBucket[trace.primaryBucket] += 1
  }

  return { generatedAt: nowIso, missingRows, traces, byPrimaryBucket }
}

export function formatFalseExclusionAuditReport(
  traced: Awaited<ReturnType<typeof traceMissingValidFalseExclusions>>
): FalseExclusionAuditReport {
  const sorted = [...traced.traces].sort((a, b) => {
    const bucketOrder =
      FALSE_EXCLUSION_TRACE_BUCKETS.indexOf(a.primaryBucket) -
      FALSE_EXCLUSION_TRACE_BUCKETS.indexOf(b.primaryBucket)
    if (bucketOrder !== 0) return bucketOrder
    return a.canonicalUrl.localeCompare(b.canonicalUrl)
  })

  return {
    generatedAt: traced.generatedAt,
    missingValidCount: traced.missingRows.length,
    tracedCount: traced.traces.length,
    byPrimaryBucket: traced.byPrimaryBucket,
    traces: sorted.slice(0, FALSE_EXCLUSION_SCOREBOARD_TRACE_LIMIT),
  }
}

/**
 * Phase 1: trace every missing valid YSTM URL, persist buckets, return admin report.
 */
export async function buildFalseExclusionAuditReport(
  admin: ReturnType<typeof getAdminDb>,
  now: Date = new Date(),
  preloadedMissingRows?: MissingObservationRow[]
): Promise<FalseExclusionAuditReport> {
  const traced = await traceMissingValidFalseExclusions(admin, now, preloadedMissingRows)
  await persistFalseExclusionTraces(admin, traced.traces)
  return formatFalseExclusionAuditReport(traced)
}
