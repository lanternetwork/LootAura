import {
  type CrawlSkipTaxonomyRollup,
} from '@/lib/admin/crawlSkipTaxonomyMetrics'
import { rollupExternalIngestionForWindow } from '@/lib/admin/ingestionFunnelMetricsHelpers'
import type { SaleInstanceShadowReplayReport } from '@/lib/ingestion/ystmCoverage/saleInstanceShadowReplayTypes'
import type { SaleInstanceIdentityMetrics } from '@/lib/admin/saleInstanceIdentityMetrics'
import { evaluateCrawlSkipTaxonomyOperationalHealth } from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmFalseExclusionSaleIdentityAlert = {
  level: 'warning' | 'critical'
  code: string
  message: string
}

export type YstmFalseExclusionSaleIdentityDashboard = {
  generatedAt: string
  missingValidYstmUrls: number
  missingNeverAttempted: number
  urlMatchSameDates: number
  urlMatchDatesChanged: number
  urlReuseDetected: number
  newEventSameUrl: number
  sameEventUpdated: number
  softDedupeSuppressed: number
  suspiciousSuppressions: number
  ambiguousRequiresReview: number
  saleInstanceKeyCollisions: number
  duplicateVisibleSaleClusters24h: number
  duplicateVisibleSameAddressDate24h: number
  coverageMatchMethodCounts: Record<string, number>
  coverageWithoutMatchMethod: number
  crawlSkipTaxonomy24h: CrawlSkipTaxonomyRollup
  healthy: boolean
  alerts: YstmFalseExclusionSaleIdentityAlert[]
}

const WINDOW_HOURS = 24
const DUPLICATE_VISIBLE_CLUSTER_THRESHOLD = 3

function normalizeAddressKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
}

async function loadCrawlSkipTaxonomy24h(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number
): Promise<CrawlSkipTaxonomyRollup> {
  const since = new Date(nowMs - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await fromBase(admin, 'ingestion_orchestration_runs')
    .select('created_at, mode, notes')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)

  const rollup = rollupExternalIngestionForWindow(
    (data ?? []) as Array<{ created_at: string; mode: string; notes: unknown }>,
    WINDOW_HOURS,
    nowMs
  )
  return rollup.crawlSkipTaxonomy
}

async function loadShadowClassifierCounts(
  admin: ReturnType<typeof getAdminDb>
): Promise<{
  newEventSameUrl: number
  sameEventUpdated: number
  ambiguousRequiresReview: number
  urlReuseDetected: number
}> {
  const { data, error } = await fromBase(admin, 'ystm_sale_instance_shadow_replays')
    .select('new_decision, divergence_kind, old_skip_sub_reason')
  if (error) throw new Error(error.message)

  let newEventSameUrl = 0
  let sameEventUpdated = 0
  let ambiguousRequiresReview = 0
  let urlReuseDetected = 0

  for (const row of data ?? []) {
    const r = row as {
      new_decision?: string
      divergence_kind?: string | null
      old_skip_sub_reason?: string | null
    }
    if (r.new_decision === 'new_event_same_url') newEventSameUrl += 1
    if (r.new_decision === 'same_event_updated') sameEventUpdated += 1
    if (r.new_decision === 'ambiguous_requires_review') ambiguousRequiresReview += 1
    if (
      r.new_decision === 'new_event_same_url' ||
      r.divergence_kind === 'old_suppress_new_publish' ||
      r.old_skip_sub_reason === 'url_match_dates_changed'
    ) {
      urlReuseDetected += 1
    }
  }

  return { newEventSameUrl, sameEventUpdated, ambiguousRequiresReview, urlReuseDetected }
}

async function loadSoftDedupeSuppressions24h(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number
): Promise<number> {
  const since = new Date(nowMs - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { count, error } = await fromBase(admin, 'ingested_sale_soft_dedupe_suppressions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function loadCoverageMatchMethodCounts(
  admin: ReturnType<typeof getAdminDb>
): Promise<{ counts: Record<string, number>; withoutMethod: number }> {
  const counts: Record<string, number> = {}
  let withoutMethod = 0
  const pageSize = 1000
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('ystm_valid_active, match_method')
      .eq('ystm_valid_active', true)
      .order('canonical_url', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = (data ?? []) as Array<{ match_method: string | null }>
    for (const row of chunk) {
      const method = row.match_method?.trim()
      if (!method) {
        withoutMethod += 1
        continue
      }
      counts[method] = (counts[method] ?? 0) + 1
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return { counts, withoutMethod }
}

async function loadDuplicateVisibleAddressDateClusters(
  admin: ReturnType<typeof getAdminDb>,
  now: Date
): Promise<{ clusters: number; extraVisibleRows: number }> {
  const buckets = new Map<string, number>()
  const pageSize = 1000
  let from = 0

  for (;;) {
    let q = fromBase(admin, 'sales').select('id, external_source_url, lat, lng')
    q = applyPhase4PublicPublishedSaleReadFilters(q, { now })
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = (data ?? []) as Array<{
      id: string
      external_source_url: string | null
      lat: number | null
      lng: number | null
    }>

    const saleIds = chunk
      .filter((s) => {
        const url = s.external_source_url?.trim()
        return url && isYstmDetailListingUrl(url) && s.lat != null && s.lng != null
      })
      .map((s) => s.id)

    if (saleIds.length > 0) {
      const { data: ingested, error: ingErr } = await fromBase(admin, 'ingested_sales')
        .select('published_sale_id, normalized_address, date_start')
        .in('published_sale_id', saleIds)
      if (ingErr) throw new Error(ingErr.message)

      for (const row of ingested ?? []) {
        const r = row as {
          normalized_address: string | null
          date_start: string | null
        }
        const addr = normalizeAddressKey(r.normalized_address)
        const date = r.date_start?.trim()
        if (!addr || !date) continue
        const key = `${addr}|${date}`
        buckets.set(key, (buckets.get(key) ?? 0) + 1)
      }
    }

    if (chunk.length < pageSize) break
    from += pageSize
  }

  let clusters = 0
  let extraVisibleRows = 0
  for (const count of buckets.values()) {
    if (count > 1) {
      clusters += 1
      extraVisibleRows += count - 1
    }
  }

  return { clusters, extraVisibleRows }
}

function evaluateAlerts(input: {
  missingValidYstmUrls: number
  shadowReplay: SaleInstanceShadowReplayReport
  crawlSkip: CrawlSkipTaxonomyRollup
  duplicateVisibleClusters: number
  coverageWithoutMatchMethod: number
}): YstmFalseExclusionSaleIdentityAlert[] {
  const alerts: YstmFalseExclusionSaleIdentityAlert[] = []

  if (input.shadowReplay.divergenceOldSuppressNewPublishCount > 0) {
    alerts.push({
      level: 'warning',
      code: 'shadow_old_suppress_new_publish',
      message: `${input.shadowReplay.divergenceOldSuppressNewPublishCount} missing valid URL(s) would publish under the new classifier but were suppressed by the legacy URL gate — review before enforcement.`,
    })
  }

  if (input.crawlSkip.suspiciousShare != null && input.crawlSkip.suspiciousShare >= 0.15) {
    alerts.push({
      level: 'warning',
      code: 'suspicious_crawl_skips_elevated',
      message: `Suspicious crawl skips are ${(input.crawlSkip.suspiciousShare * 100).toFixed(1)}% of classified skips (${input.crawlSkip.suspicious}/${input.crawlSkip.total}) in the last ${WINDOW_HOURS}h.`,
    })
  }

  const urlReuseSkips =
    (input.crawlSkip.subReasons.url_match_dates_changed ?? 0) +
    (input.crawlSkip.subReasons.url_match_expired_row ?? 0)
  if (urlReuseSkips >= 10) {
    alerts.push({
      level: 'warning',
      code: 'url_reuse_skips_elevated',
      message: `${urlReuseSkips} URL reuse–related crawl skips in the last ${WINDOW_HOURS}h (date-changed + expired-row paths).`,
    })
  }

  if (input.duplicateVisibleClusters >= DUPLICATE_VISIBLE_CLUSTER_THRESHOLD) {
    alerts.push({
      level: 'warning',
      code: 'duplicate_visible_clusters',
      message: `${input.duplicateVisibleClusters} visible address+date clusters have multiple published YSTM pins (duplicate-visible guardrail).`,
    })
  }

  if (input.missingValidYstmUrls > 0 && input.coverageWithoutMatchMethod === input.missingValidYstmUrls) {
    alerts.push({
      level: 'warning',
      code: 'coverage_match_method_unpopulated',
      message: `All ${input.missingValidYstmUrls} valid-active coverage rows lack match_method — run a coverage audit after Phase 11 deploy.`,
    })
  }

  return alerts
}

export type BuildYstmFalseExclusionSaleIdentityDashboardInput = {
  missingValidYstmUrls: number
  missingNeverAttempted: number
  saleInstanceIdentity: SaleInstanceIdentityMetrics
  saleInstanceShadowReplay: SaleInstanceShadowReplayReport
}

/**
 * Phase 13: unified false-exclusion / sale-identity operational dashboard.
 */
export async function buildYstmFalseExclusionSaleIdentityDashboard(
  admin: ReturnType<typeof getAdminDb>,
  input: BuildYstmFalseExclusionSaleIdentityDashboardInput,
  now: Date = new Date()
): Promise<YstmFalseExclusionSaleIdentityDashboard> {
  const nowMs = now.getTime()

  const [
    crawlSkipTaxonomy24h,
    shadowCounts,
    softDedupeSuppressed,
    matchMethods,
    duplicateVisible,
  ] = await Promise.all([
    loadCrawlSkipTaxonomy24h(admin, nowMs),
    loadShadowClassifierCounts(admin),
    loadSoftDedupeSuppressions24h(admin, nowMs),
    loadCoverageMatchMethodCounts(admin),
    loadDuplicateVisibleAddressDateClusters(admin, now),
  ])

  const crawlSkipHealth = evaluateCrawlSkipTaxonomyOperationalHealth(crawlSkipTaxonomy24h)

  const urlMatchSameDates =
    (crawlSkipTaxonomy24h.subReasons.url_match_same_dates ?? 0) +
    (crawlSkipTaxonomy24h.subReasons.url_match_same_payload ?? 0)

  const alerts = evaluateAlerts({
    missingValidYstmUrls: input.missingValidYstmUrls,
    shadowReplay: input.saleInstanceShadowReplay,
    crawlSkip: crawlSkipTaxonomy24h,
    duplicateVisibleClusters: duplicateVisible.clusters,
    coverageWithoutMatchMethod: matchMethods.withoutMethod,
  })

  return {
    generatedAt: now.toISOString(),
    missingValidYstmUrls: input.missingValidYstmUrls,
    missingNeverAttempted: input.missingNeverAttempted,
    urlMatchSameDates,
    urlMatchDatesChanged: crawlSkipTaxonomy24h.subReasons.url_match_dates_changed ?? 0,
    urlReuseDetected: shadowCounts.urlReuseDetected,
    newEventSameUrl: shadowCounts.newEventSameUrl,
    sameEventUpdated: shadowCounts.sameEventUpdated,
    softDedupeSuppressed,
    suspiciousSuppressions: crawlSkipTaxonomy24h.suspicious,
    ambiguousRequiresReview: shadowCounts.ambiguousRequiresReview,
    saleInstanceKeyCollisions: input.saleInstanceIdentity.keyCollisionGroups,
    duplicateVisibleSaleClusters24h: duplicateVisible.clusters,
    duplicateVisibleSameAddressDate24h: duplicateVisible.extraVisibleRows,
    coverageMatchMethodCounts: matchMethods.counts,
    coverageWithoutMatchMethod: matchMethods.withoutMethod,
    crawlSkipTaxonomy24h,
    healthy: crawlSkipHealth.healthy && alerts.length === 0,
    alerts: [...crawlSkipHealth.alerts, ...alerts],
  }
}
