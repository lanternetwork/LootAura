import { fetchAcquisitionRegistrySummary } from '@/lib/admin/acquisitionMetricsHelpers'
import { partitionCrawlableExternalCityConfigs } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmSourceExpansionMetrics = {
  generatedAt: string
  enabledExternalConfigs: number
  crawlableConfigs: number
  configsSkippedNoSourcePages: number
  configsSkippedInvalidUrls: number
  configsSkippedCrawlExcluded: number
  pendingDiscoveryConfigs: number
  validatedDiscoveryConfigs: number
  failedDiscoveryConfigs: number
  saturatedConfigs: number
  configsWithRecentInsert: number
  /** Enabled external configs with zero HTTPS source pages (expansion backlog). */
  configsWithoutSourcePages: number
}

type ConfigRow = {
  city: string
  state: string
  source_platform: string
  source_pages: unknown
  source_crawl_excluded_at?: string | null
  source_discovery_status?: string | null
}

export async function buildYstmSourceExpansionMetrics(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<YstmSourceExpansionMetrics> {
  const [registry, rowsResult] = await Promise.all([
    fetchAcquisitionRegistrySummary(admin, nowMs),
    fromBase(admin, 'ingestion_city_configs')
      .select('city, state, source_platform, source_pages, source_crawl_excluded_at, source_discovery_status')
      .eq('enabled', true)
      .eq('source_platform', 'external_page_source'),
  ])

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message)
  }

  const rows = (rowsResult.data ?? []) as ConfigRow[]
  const partition = partitionCrawlableExternalCityConfigs(rows)

  let configsWithoutSourcePages = 0
  for (const row of rows) {
    if (row.source_crawl_excluded_at) continue
    const pages = Array.isArray(row.source_pages) ? row.source_pages : []
    if (pages.length === 0) {
      configsWithoutSourcePages += 1
    }
  }

  return {
    generatedAt: new Date(nowMs).toISOString(),
    enabledExternalConfigs: registry.enabledExternalConfigs,
    crawlableConfigs: registry.crawlableConfigs,
    configsSkippedNoSourcePages: registry.configsSkippedNoSourcePages,
    configsSkippedInvalidUrls: registry.configsSkippedInvalidUrls,
    configsSkippedCrawlExcluded: partition.configsSkippedCrawlExcluded,
    pendingDiscoveryConfigs: registry.pendingDiscoveryConfigs,
    validatedDiscoveryConfigs: registry.validatedDiscoveryConfigs,
    failedDiscoveryConfigs: registry.failedDiscoveryConfigs,
    saturatedConfigs: registry.saturatedConfigs,
    configsWithRecentInsert: registry.configsWithRecentInsert,
    configsWithoutSourcePages,
  }
}
