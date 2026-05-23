import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { classifyFalseExclusionTrace } from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'
import {
  FALSE_EXCLUSION_TRACE_BUCKETS,
  type FalseExclusionAuditReport,
  type FalseExclusionTraceBucket,
  type FalseExclusionUrlTrace,
} from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
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
  missing_ingestion_outcome: string | null
  missing_ingestion_attempted_at: string | null
  missing_ingestion_failure_reason: string | null
  last_detail_checked_at: string | null
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
        'canonical_url, state, city, config_key, missing_ingestion_outcome, missing_ingestion_attempted_at, missing_ingestion_failure_reason, last_detail_checked_at'
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

async function loadIngestedByUrls(
  admin: ReturnType<typeof getAdminDb>,
  urls: string[]
): Promise<Map<string, import('@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace').FalseExclusionIngestedRowSnapshot>> {
  const map = new Map<
    string,
    import('@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace').FalseExclusionIngestedRowSnapshot
  >()
  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const slice = urls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, status, published_sale_id, is_duplicate, address_status, failure_reasons, date_start, date_end, catalog_repair_outcome, source_listing_id, sale_instance_key'
      )
      .in('source_url', slice)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const r = row as {
        id: string
        source_url: string
        status: string
        published_sale_id: string | null
        is_duplicate: boolean
        address_status: string | null
        failure_reasons: unknown
        date_start: string | null
        date_end: string | null
        catalog_repair_outcome: string | null
        source_listing_id: string | null
        sale_instance_key: string | null
      }
      map.set(r.source_url, {
        id: r.id,
        status: r.status,
        published_sale_id: r.published_sale_id,
        is_duplicate: r.is_duplicate,
        address_status: r.address_status,
        failure_reasons: r.failure_reasons,
        date_start: r.date_start,
        date_end: r.date_end,
        catalog_repair_outcome: r.catalog_repair_outcome,
        source_listing_id: r.source_listing_id,
        sale_instance_key: r.sale_instance_key,
      })
    }
  }
  return map
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
 * Phase 1: trace every missing valid YSTM URL, persist buckets, return admin report.
 */
export async function buildFalseExclusionAuditReport(
  admin: ReturnType<typeof getAdminDb>,
  now: Date = new Date(),
  preloadedMissingRows?: MissingObservationRow[]
): Promise<FalseExclusionAuditReport> {
  const nowIso = now.toISOString()
  const missingRows = preloadedMissingRows ?? (await listMissingValidObservations(admin))
  const urls = missingRows.map((r) => r.canonical_url)
  const [ingestedByUrl, configByKey, publishedIndex] = await Promise.all([
    loadIngestedByUrls(admin, urls),
    loadConfigsForObservations(admin, missingRows),
    loadLootAuraPublishedYstmIndex(admin, now),
  ])

  const byPrimaryBucket = emptyBucketCounts()
  const traces: FalseExclusionUrlTrace[] = []

  for (const row of missingRows) {
    const configKey =
      row.config_key ??
      (row.state && row.city ? `${row.state}|${row.city}` : null)
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
      ingested: ingestedByUrl.get(row.canonical_url) ?? null,
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

  await persistFalseExclusionTraces(admin, traces)

  const sorted = [...traces].sort((a, b) => {
    const bucketOrder =
      FALSE_EXCLUSION_TRACE_BUCKETS.indexOf(a.primaryBucket) -
      FALSE_EXCLUSION_TRACE_BUCKETS.indexOf(b.primaryBucket)
    if (bucketOrder !== 0) return bucketOrder
    return a.canonicalUrl.localeCompare(b.canonicalUrl)
  })

  return {
    generatedAt: nowIso,
    missingValidCount: missingRows.length,
    tracedCount: traces.length,
    byPrimaryBucket,
    traces: sorted.slice(0, FALSE_EXCLUSION_SCOREBOARD_TRACE_LIMIT),
  }
}
