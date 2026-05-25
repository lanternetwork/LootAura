import {
  normalizeSourcePages,
  persistExternalPageSource,
  type ExternalPageSourcePersistSummary,
} from '@/lib/ingestion/adapters/externalPageSource'
import { buildEsnetAdaptiveCrawlPlan } from '@/lib/ingestion/estatesalesnet/esnetAdaptiveRefreshPolicy'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'
import {
  evaluateEsnetIngestCadence,
  recordEsnetIngestCadenceCompleted,
} from '@/lib/ingestion/estatesalesnet/esnetIngestCadence'
import {
  parseEsnetIngestConfigBatchSize,
  parseEsnetIngestExecutionBudgetMs,
} from '@/lib/ingestion/estatesalesnet/esnetIngestionOrchestrationDefaults'
import {
  countEsnetCrawlableIngestionConfigs,
  maybeAutoDisableEsnetCoverageBootstrap,
} from '@/lib/ingestion/estatesalesnet/esnetCoverageBootstrapExit'
import {
  fetchEsnetBootstrapEnabled,
  fetchEsnetIngestEnabled,
} from '@/lib/ingestion/estatesalesnet/esnetOrchestrationState'
import {
  emptyExternalCrawlSkipSubReasonCounts,
  mergeCrawlSkipSubReasonCounts,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import {
  partitionCrawlableCityConfigsByPlatform,
  type ExternalCityConfigRow,
} from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type EsnetIngestionCronBatchArgs = {
  enabledRows: ExternalCityConfigRow[]
  budgetStartedAtMs: number
  telemetryContext?: Record<string, unknown>
  beforePageFetch?: NonNullable<Parameters<typeof persistExternalPageSource>[1]>['beforePageFetch']
}

export type EsnetIngestionCronBatchResult = {
  skipped: boolean
  skipReason?: string
  summary: ExternalPageSourcePersistSummary | null
  bootstrapAutoDisabled?: boolean
}

function emptyTotals(): ExternalPageSourcePersistSummary {
  return {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    invalid: 0,
    errors: 0,
    pagesProcessed: 0,
    duplicateScoredSkipped: 0,
    skippedExpired: 0,
    freshInserted: 0,
    duplicateExistingUrl: 0,
    duplicateCrossCityPage: 0,
    duplicateCanonicalCollision: 0,
    duplicateExpiredRow: 0,
    ystmDetailFirstAttempted: 0,
    ystmDetailFirstSucceeded: 0,
    ystmDetailFirstPublished: 0,
    ystmDetailFirstFallback: 0,
    ystmDetailFirstFetchFailed: 0,
    ystmDetailFirstReadyAtInsertRate: null,
    ystmDetailFirstMedianMsToPublished: null,
    ystmDetailFirstMsToPublishedSamples: [],
    ystmDetailFirstFallbackByReason: {},
    ystmDetailFirstTopFallbackReason: null,
    ystmDetailFirstTopFallbackReasonPct: null,
    detailFirstAddressFromDetailPage: 0,
    detailFirstAddressFromListSeed: 0,
    detailFirstAddressFromDetailPageRate: null,
    ystmDetailFirstInsertFailedByDbCode: {},
    ystmListRecrawlRefreshAttempted: 0,
    ystmListRecrawlRefreshSucceeded: 0,
    esnetDetailEnrichmentAttempted: 0,
    esnetDetailEnrichmentSucceeded: 0,
    esnetDetailEnrichmentFetchFailed: 0,
    esnetDetailEnrichmentParseFailed: 0,
    crawlSkipSubReasons: emptyExternalCrawlSkipSubReasonCounts(),
  }
}

/**
 * Bounded ES.net list ingest pass for daily cron.
 * Gated by DB `esnet_ingest_enabled`; burst budgets from `esnet_bootstrap_enabled` only.
 */
export async function runEsnetPlatformIngestionCronBatch(
  args: EsnetIngestionCronBatchArgs
): Promise<EsnetIngestionCronBatchResult> {
  const adminDb = getAdminDb()
  const ingestEnabled = await fetchEsnetIngestEnabled(adminDb)
  if (!ingestEnabled) {
    return { skipped: true, skipReason: 'esnet_ingest_disabled', summary: null }
  }

  const bootstrapEnabled = await fetchEsnetBootstrapEnabled(adminDb)
  const cadence = await evaluateEsnetIngestCadence({ bootstrapEnabled, admin: adminDb })
  if (!cadence.shouldRun) {
    return {
      skipped: true,
      skipReason: cadence.skipReason ?? 'esnet_ingest_cadence_throttle',
      summary: null,
    }
  }

  const executionBudgetMs = parseEsnetIngestExecutionBudgetMs(bootstrapEnabled)
  const batchSize = parseEsnetIngestConfigBatchSize(bootstrapEnabled)

  const esnetRows = args.enabledRows.filter((row) => row.source_platform === ESNET_SOURCE_PLATFORM)
  const crawlablePartition = partitionCrawlableCityConfigsByPlatform(esnetRows, ESNET_SOURCE_PLATFORM)
  const plannedRows = await buildEsnetAdaptiveCrawlPlan(adminDb, crawlablePartition.crawlable)
  const totalConfigs = plannedRows.length
  if (totalConfigs === 0) {
    return { skipped: true, skipReason: 'no_crawlable_esnet_configs', summary: null }
  }

  const cappedCount = Math.min(batchSize, totalConfigs)
  const boundedRows = plannedRows.slice(0, cappedCount)
  const totals = emptyTotals()

  logger.info('ES.net ingestion batch started', {
    component: 'ingestion/estatesalesnet/runEsnetPlatformIngestionCronBatch',
    operation: 'batch_start',
    bootstrapEnabled,
    ingestMinIntervalMinutes: cadence.minIntervalMinutes,
    totalConfigs,
    boundedConfigs: boundedRows.length,
    configsCrawlable: crawlablePartition.configsCrawlable,
    ...args.telemetryContext,
  })

  for (const row of boundedRows) {
    if (Date.now() - args.budgetStartedAtMs >= executionBudgetMs) break
    const pages = normalizeSourcePages(row.source_pages)
    if (pages.length === 0) continue

    const s = await persistExternalPageSource(
      {
        city: row.city,
        state: row.state,
        source_platform: ESNET_SOURCE_PLATFORM,
        source_pages: row.source_pages,
      },
      {
        telemetryContext: args.telemetryContext,
        beforePageFetch: args.beforePageFetch,
        esnetIngestEnabled: true,
      }
    )

    totals.fetched += s.fetched
    totals.inserted += s.inserted
    totals.skipped += s.skipped
    totals.invalid += s.invalid
    totals.errors += s.errors
    totals.pagesProcessed += s.pagesProcessed
    totals.skippedExpired += s.skippedExpired ?? 0
    totals.freshInserted += s.freshInserted ?? 0
    totals.duplicateExistingUrl += s.duplicateExistingUrl ?? 0
    totals.duplicateCrossCityPage += s.duplicateCrossCityPage ?? 0
    totals.duplicateCanonicalCollision += s.duplicateCanonicalCollision ?? 0
    totals.duplicateExpiredRow += s.duplicateExpiredRow ?? 0
    mergeCrawlSkipSubReasonCounts(totals.crawlSkipSubReasons, s.crawlSkipSubReasons)
    totals.esnetDetailEnrichmentAttempted += s.esnetDetailEnrichmentAttempted ?? 0
    totals.esnetDetailEnrichmentSucceeded += s.esnetDetailEnrichmentSucceeded ?? 0
    totals.esnetDetailEnrichmentFetchFailed += s.esnetDetailEnrichmentFetchFailed ?? 0
    totals.esnetDetailEnrichmentParseFailed += s.esnetDetailEnrichmentParseFailed ?? 0
  }

  await recordEsnetIngestCadenceCompleted(adminDb)

  let bootstrapAutoDisabled = false
  if (bootstrapEnabled) {
    const crawlableConfigCount = await countEsnetCrawlableIngestionConfigs(adminDb)
    const auto = await maybeAutoDisableEsnetCoverageBootstrap(adminDb, {
      crawlableConfigCount,
      fetchFailureRate24h: null,
    })
    bootstrapAutoDisabled = auto.disabled
  }

  return { skipped: false, summary: totals, bootstrapAutoDisabled }
}

export function mergeEsnetTotalsIntoIngestionStep(
  target: Record<string, unknown>,
  esnet: ExternalPageSourcePersistSummary
): void {
  target.esnetFetched = esnet.fetched
  target.esnetInserted = esnet.inserted
  target.esnetSkipped = esnet.skipped
  target.esnetErrors = esnet.errors
  target.esnetDetailEnrichmentAttempted = esnet.esnetDetailEnrichmentAttempted
  target.esnetDetailEnrichmentSucceeded = esnet.esnetDetailEnrichmentSucceeded
}
