import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { partitionCrawlableExternalCityConfigs } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import {
  averageWindowInsertYield,
  countSaturatedFromStatsRows,
  type ConfigCrawlStatsSnapshot,
} from '@/lib/ingestion/acquisition/configCrawlStats'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import { computeRate } from '@/lib/admin/ingestionVolumeMetricsHelpers'

export type AcquisitionRegistrySummary = {
  enabledExternalConfigs: number
  crawlableConfigs: number
  configsSkippedNoSourcePages: number
  configsSkippedInvalidUrls: number
  configsSkippedCrawlExcluded: number
  pendingDiscoveryConfigs: number
  validatedDiscoveryConfigs: number
  manualDiscoveryConfigs: number
  failedDiscoveryConfigs: number
  saturatedConfigs: number
  configsWithRecentInsert: number
  avgConfigWindowInsertYield: number | null
  discoveryFailureReasons: Record<string, number>
}

type ConfigRow = ConfigCrawlStatsSnapshot & {
  city: string
  state: string
  source_platform: string
  source_pages: unknown
  source_crawl_excluded_at?: string | null
  source_discovery_status?: string | null
  source_discovery_failure_reason?: string | null
}

export async function fetchAcquisitionRegistrySummary(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number
): Promise<AcquisitionRegistrySummary> {
  const { data, error } = await fromBase(admin, 'ingestion_city_configs')
    .select(
      'city, state, source_platform, source_pages, source_crawl_excluded_at, source_discovery_status, source_discovery_failure_reason, source_crawl_window_fetched, source_crawl_window_skipped, source_crawl_window_inserted, source_crawl_window_started_at, source_crawl_last_at, source_crawl_last_insert_at'
    )
    .eq('enabled', true)
    .eq('source_platform', 'external_page_source')

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as ConfigRow[]
  const partition = partitionCrawlableExternalCityConfigs(rows)

  let pendingDiscoveryConfigs = 0
  let validatedDiscoveryConfigs = 0
  let manualDiscoveryConfigs = 0
  let failedDiscoveryConfigs = 0
  let configsWithRecentInsert = 0
  const discoveryFailureReasons: Record<string, number> = {}

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

  for (const row of rows) {
    const status = row.source_discovery_status ?? ''
    if (status === SOURCE_DISCOVERY_STATUS.pending) pendingDiscoveryConfigs += 1
    if (status === SOURCE_DISCOVERY_STATUS.validated) validatedDiscoveryConfigs += 1
    if (status === SOURCE_DISCOVERY_STATUS.manual) manualDiscoveryConfigs += 1
    if (status === SOURCE_DISCOVERY_STATUS.failed) {
      failedDiscoveryConfigs += 1
      const reason = (row.source_discovery_failure_reason ?? 'unknown').trim() || 'unknown'
      discoveryFailureReasons[reason] = (discoveryFailureReasons[reason] ?? 0) + 1
    }
    const lastInsert = row.source_crawl_last_insert_at
    if (lastInsert) {
      const ms = Date.parse(lastInsert)
      if (Number.isFinite(ms) && nowMs - ms <= sevenDaysMs) {
        configsWithRecentInsert += 1
      }
    }
  }

  const crawlableRows = partition.crawlable as ConfigCrawlStatsSnapshot[]

  return {
    enabledExternalConfigs: rows.length,
    crawlableConfigs: partition.configsCrawlable,
    configsSkippedNoSourcePages: partition.configsSkippedNoSourcePages,
    configsSkippedInvalidUrls: partition.configsSkippedInvalidUrls,
    configsSkippedCrawlExcluded: partition.configsSkippedCrawlExcluded,
    pendingDiscoveryConfigs,
    validatedDiscoveryConfigs,
    manualDiscoveryConfigs,
    failedDiscoveryConfigs,
    saturatedConfigs: countSaturatedFromStatsRows(crawlableRows, nowMs),
    configsWithRecentInsert,
    avgConfigWindowInsertYield: averageWindowInsertYield(crawlableRows),
    discoveryFailureReasons,
  }
}

export function mapHourlyRateSeries(params: {
  numeratorByHour: Map<string, number>
  denominatorByHour: Map<string, number>
}): Array<{ bucket: string; value: number | null }> {
  const buckets = new Set([...params.numeratorByHour.keys(), ...params.denominatorByHour.keys()])
  return [...buckets]
    .sort()
    .map((bucket) => ({
      bucket,
      value: computeRate(
        params.numeratorByHour.get(bucket) ?? 0,
        params.denominatorByHour.get(bucket) ?? 0
      ),
    }))
}

export function computeAcquisitionRunRates(params: {
  fetched24h: number
  inserted24h: number
  skipped24h: number
}): {
  insertYield24h: number | null
  saturationRate24h: number | null
} {
  return {
    insertYield24h: computeRate(params.inserted24h, params.fetched24h),
    saturationRate24h: computeRate(
      params.skipped24h,
      params.fetched24h + params.skipped24h
    ),
  }
}
