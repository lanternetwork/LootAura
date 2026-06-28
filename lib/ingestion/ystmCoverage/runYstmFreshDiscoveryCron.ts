import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { attemptYstmListFastPublish } from '@/lib/ingestion/acquisition/ystmListFastPublish'
import {
  acquireIngestionOrchestrationLease,
  releaseIngestionOrchestrationLease,
} from '@/lib/ingestion/ingestionOrchestrationLease'
import {
  partitionCrawlableExternalCityConfigs,
  type ExternalCityConfigRow,
} from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { buildYstmListSightObservationUpsert } from '@/lib/ingestion/ystmCoverage/buildYstmListSightObservationUpsert'
import {
  extractYstmListMetadataSales,
} from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import { loadYstmCoverageObservationsForRelist } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageObservationsForRelist'
import { loadYstmCoverageLootAuraMatchIndex } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageLootAuraMatchIndex'
import { matchYstmCoverageLootAuraFootprint } from '@/lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint'
import { resolveYstmStrategicMetroRegistry } from '@/lib/ingestion/ystmCoverage/resolveYstmStrategicMetroRegistry'
import { rotateConfigsFromCursor } from '@/lib/ingestion/ystmCoverage/selectYstmCoverageAuditConfigs'
import {
  HOT_DISCOVERY_AGE_HOURS,
  YSTM_FRESH_DISCOVERY_BUDGETS,
  YSTM_FRESH_DISCOVERY_STATE_KEY,
  type YstmFreshDiscoveryBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmFreshDiscoveryConfig'
import {
  upsertYstmCoverageObservations,
  type YstmCoverageObservationUpsert,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type YstmFreshDiscoveryCronTelemetry = {
  skipped: boolean
  skipReason: string | null
  configCursorBefore: number
  configCursorAfter: number
  configsProcessed: number
  listPagesFetched: number
  metadataSalesDiscovered: number
  observationsUpserted: number
  validActiveFromList: number
  hotMarked: number
  inlineIngestAttempts: number
  inlinePublished: number
  inlineIngested: number
  inlineFailed: number
  inlineSkippedDuplicate: number
  expiredObsSeenAgain: number
  expiredObsRefreshScheduled: number
}

export type YstmFreshDiscoveryCronResult = {
  ok: boolean
  telemetry: YstmFreshDiscoveryCronTelemetry
}

function buildConfigKey(city: string, state: string): string {
  return `${state}|${city}`
}

function configIdentityKey(config: ExternalCityConfigRow): string {
  return config.id ? `id:${config.id}` : buildConfigKey(config.city ?? '', config.state ?? '')
}

function buildFreshDiscoveryConfigOrder(params: {
  crawlableConfigs: ExternalCityConfigRow[]
  cursorBefore: number
  maxConfigsPerRun: number
}): { ordered: ExternalCityConfigRow[]; catalogSize: number; cursorAfter: number } {
  const { resolved } = resolveYstmStrategicMetroRegistry({
    crawlableConfigs: params.crawlableConfigs,
  })
  const strategicIds = new Set(resolved.map((item) => configIdentityKey(item.config)))
  const strategicConfigs = resolved.map((item) => item.config)
  const longTail = params.crawlableConfigs.filter((c) => !strategicIds.has(configIdentityKey(c)))
  const rotatedLongTail = rotateConfigsFromCursor(longTail, params.cursorBefore)
  const ordered = [...strategicConfigs, ...rotatedLongTail].slice(0, params.maxConfigsPerRun)
  const catalogSize = params.crawlableConfigs.length
  const cursorAfter =
    longTail.length === 0 ? 0 : (params.cursorBefore + Math.max(1, ordered.length - strategicConfigs.length)) % longTail.length
  return { ordered, catalogSize, cursorAfter }
}

function isHotDiscovery(listSeenAt: string, nowMs: number): boolean {
  const seenMs = Date.parse(listSeenAt)
  if (!Number.isFinite(seenMs)) return true
  return nowMs - seenMs <= HOT_DISCOVERY_AGE_HOURS * 60 * 60 * 1000
}

export async function runYstmFreshDiscoveryCron(
  admin: ReturnType<typeof getAdminDb>,
  options?: { budgets?: YstmFreshDiscoveryBudgets }
): Promise<YstmFreshDiscoveryCronResult> {
  const budgets = options?.budgets ?? YSTM_FRESH_DISCOVERY_BUDGETS
  const logContext = { component: 'ingestion/ystmCoverage/runYstmFreshDiscoveryCron' }
  const startedMs = Date.now()

  const lease = await acquireIngestionOrchestrationLease(YSTM_FRESH_DISCOVERY_STATE_KEY, logContext)
  if (!lease.acquired) {
    return {
      ok: true,
      telemetry: {
        skipped: true,
        skipReason: lease.reason ?? 'active_lease',
        configCursorBefore: lease.cursor,
        configCursorAfter: lease.cursor,
        configsProcessed: 0,
        listPagesFetched: 0,
        metadataSalesDiscovered: 0,
        observationsUpserted: 0,
        validActiveFromList: 0,
        hotMarked: 0,
        inlineIngestAttempts: 0,
        inlinePublished: 0,
        inlineIngested: 0,
        inlineFailed: 0,
        inlineSkippedDuplicate: 0,
        expiredObsSeenAgain: 0,
        expiredObsRefreshScheduled: 0,
      },
    }
  }

  const configCursorBefore = lease.cursor
  let configCursorAfter = configCursorBefore
  let configsProcessed = 0
  let listPagesFetched = 0
  let metadataSalesDiscovered = 0
  let observationsUpserted = 0
  let validActiveFromList = 0
  let hotMarked = 0
  let inlineIngestAttempts = 0
  let inlinePublished = 0
  let inlineIngested = 0
  let inlineFailed = 0
  let inlineSkippedDuplicate = 0
  let expiredObsSeenAgain = 0
  let expiredObsRefreshScheduled = 0

  try {
    const matchIndex = await loadYstmCoverageLootAuraMatchIndex(admin)
    const { data: configData, error: configError } = await fromBase(admin, 'ingestion_city_configs')
      .select('id, city, state, source_platform, source_pages, source_crawl_excluded_at')
      .eq('enabled', true)
      .eq('source_platform', 'external_page_source')
    if (configError) throw new Error(configError.message)

    const partition = partitionCrawlableExternalCityConfigs((configData ?? []) as ExternalCityConfigRow[])
    const { ordered, cursorAfter } = buildFreshDiscoveryConfigOrder({
      crawlableConfigs: partition.crawlable,
      cursorBefore: configCursorBefore,
      maxConfigsPerRun: budgets.maxConfigsPerRun,
    })
    configCursorAfter = cursorAfter

    const listSeenAt = new Date().toISOString()
    const pendingUpserts: YstmCoverageObservationUpsert[] = []
    const inlineCandidates: Array<{
      sale: ReturnType<typeof extractYstmListMetadataSales>[number]
      city: string
      state: string
      configKey: string
    }> = []

    for (const config of ordered) {
      if (configsProcessed >= budgets.maxConfigsPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

      const pages = normalizeSourcePages(config.source_pages)
      if (pages.length === 0) {
        configsProcessed += 1
        continue
      }

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        if (listPagesFetched >= budgets.maxListFetchesPerRun) break
        if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

        const pageUrl = pages[pageIndex]!
        try {
          const html = await fetchSafeExternalPageHtml(pageUrl, {
            city: config.city,
            state: config.state,
            pageIndex,
            adapter: 'ystm_fresh_discovery',
          })
          listPagesFetched += 1
          const sales = extractYstmListMetadataSales(html, pageUrl).slice(0, budgets.maxUrlsPerListPage)
          metadataSalesDiscovered += sales.length
          const configKey = buildConfigKey(config.city ?? '', config.state ?? '')
          const existingByUrl = await loadYstmCoverageObservationsForRelist(
            admin,
            sales.map((sale) => sale.canonicalUrl)
          )

          for (const sale of sales) {
            const footprint = matchYstmCoverageLootAuraFootprint(matchIndex, {
              canonicalUrl: sale.canonicalUrl,
              saleInstanceKey: null,
              sourceListingId: null,
              normalizedAddress: sale.address?.toLowerCase().trim() ?? null,
              dateStart: sale.startDate,
              dateEnd: sale.endDate,
              identity: null,
            })
            const existing = existingByUrl.get(sale.canonicalUrl) ?? null
            if (existing?.ystmInvalidReason === 'expired') {
              expiredObsSeenAgain += 1
            }

            const upsert = buildYstmListSightObservationUpsert({
              sale,
              city: config.city ?? '',
              state: config.state ?? '',
              configKey,
              listSeenAt,
              appearanceSource: 'fresh_discovery',
              footprint,
              existing,
              relistDetectedAt: listSeenAt,
              hotDiscovery: isHotDiscovery(listSeenAt, startedMs),
            })

            if (upsert.needsDetailRefresh) {
              expiredObsRefreshScheduled += 1
            }
            if (upsert.ystmValidActive) {
              validActiveFromList += 1
            }

            const hot =
              upsert.ystmValidActive === true &&
              !upsert.needsDetailRefresh &&
              !footprint.lootauraVisible &&
              upsert.discoveryPriority === 'hot'
            if (hot) hotMarked += 1

            pendingUpserts.push(upsert)

            if (hot && inlineIngestAttempts < budgets.maxInlineIngestPerRun) {
              inlineCandidates.push({ sale, city: config.city ?? '', state: config.state ?? '', configKey })
            }
          }
        } catch (err) {
          logger.warn('YSTM fresh discovery list fetch failed', {
            ...logContext,
            city: config.city,
            state: config.state,
            pageIndex,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
      configsProcessed += 1
    }

    if (pendingUpserts.length > 0) {
      await upsertYstmCoverageObservations(admin, pendingUpserts)
      observationsUpserted = pendingUpserts.length
    }

    for (const candidate of inlineCandidates) {
      if (inlineIngestAttempts >= budgets.maxInlineIngestPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break
      inlineIngestAttempts += 1
      const result = await attemptYstmListFastPublish({
        sale: candidate.sale,
        city: candidate.city,
        state: candidate.state,
        configKey: candidate.configKey,
        telemetryContext: { adapter: 'ystm_fresh_discovery_inline' },
      })
      if (result.outcome === 'published') inlinePublished += 1
      else if (result.outcome === 'ingested') inlineIngested += 1
      else if (result.outcome === 'skipped_duplicate') inlineSkippedDuplicate += 1
      else inlineFailed += 1
    }

    await releaseIngestionOrchestrationLease(YSTM_FRESH_DISCOVERY_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: configCursorAfter,
      markCompleted: true,
    })

    return {
      ok: true,
      telemetry: {
        skipped: false,
        skipReason: null,
        configCursorBefore,
        configCursorAfter,
        configsProcessed,
        listPagesFetched,
        metadataSalesDiscovered,
        observationsUpserted,
        validActiveFromList,
        hotMarked,
        inlineIngestAttempts,
        inlinePublished,
        inlineIngested,
        inlineFailed,
        inlineSkippedDuplicate,
        expiredObsSeenAgain,
        expiredObsRefreshScheduled,
      },
    }
  } catch (err) {
    await releaseIngestionOrchestrationLease(YSTM_FRESH_DISCOVERY_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: configCursorAfter,
      markCompleted: false,
    })
    throw err
  }
}
