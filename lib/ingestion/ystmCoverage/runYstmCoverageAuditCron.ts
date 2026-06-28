import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { fetchCoverageBootstrapEnabled } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import { fetchCoverageTieredSchedulerEnabled } from '@/lib/ingestion/ystmCoverage/coverageTieredSchedulerMode'
import { buildTieredYstmCoverageAuditConfigOrder } from '@/lib/ingestion/ystmCoverage/buildTieredYstmCoverageAuditConfigOrder'
import { loadYstmConfigVelocityWeightByKey } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/loadYstmDiscoveryFreshnessMetrics'
import { resolveYstmStrategicMetroRegistry } from '@/lib/ingestion/ystmCoverage/resolveYstmStrategicMetroRegistry'
import {
  parseYstmCoverageAuditBudgets,
  YSTM_COVERAGE_AUDIT_STATE_KEY,
  type YstmCoverageAuditBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageAuditConfig'
import { runPostAuditCoverageReconcile } from '@/lib/ingestion/ystmCoverage/runPostAuditCoverageReconcile'
import {
  buildYstmCoverageAuditConfigOrder,
  type YstmCoverageAuditSelectionMode,
} from '@/lib/ingestion/ystmCoverage/selectYstmCoverageAuditConfigs'
import { extractYstmListingUrlsFromListHtml } from '@/lib/ingestion/ystmCoverage/extractYstmListingUrlsFromListHtml'
import {
  buildYstmAuditUrlListUpsert,
  buildYstmListSightObservationUpsert,
} from '@/lib/ingestion/ystmCoverage/buildYstmListSightObservationUpsert'
import { extractYstmListMetadataSales } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import { loadYstmCoverageObservationsForRelist } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageObservationsForRelist'
import {
  aggregateYstmCoverageObservations,
  loadYstmCoverageConfigStalenessHoursByKey,
  upsertYstmCoverageObservations,
  type YstmCoverageObservationUpsert,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import {
  insertYstmCoverageAuditConfigEvents,
  type YstmCoverageAuditConfigEventInsert,
  type YstmCoverageAuditConfigEventOutcome,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageAuditConfigEventsStore'
import { loadYstmCoverageLootAuraMatchIndex } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageLootAuraMatchIndex'
import { matchYstmCoverageLootAuraFootprint } from '@/lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint'
import { computeYstmSaleInstanceIdentity } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import {
  classifyFetchErrorForCoverage,
  classifyYstmDetailAsValidActive,
  computeCoveragePct,
  type YstmCoverageInvalidReason,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import {
  acquireIngestionOrchestrationLease,
  releaseIngestionOrchestrationLease,
} from '@/lib/ingestion/ingestionOrchestrationLease'
import {
  partitionCrawlableExternalCityConfigs,
  type ExternalCityConfigRow,
} from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type YstmCoverageAuditCronTelemetry = {
  skipped: boolean
  skipReason: string | null
  bootstrapNationwide: boolean
  tieredSchedulerEnabled: boolean
  auditSelectionMode: YstmCoverageAuditSelectionMode | null
  configCursorBefore: number
  configCursorAfter: number
  longTailCursorBefore: number | null
  longTailCursorAfter: number | null
  tier1Scheduled: number
  tier2Scheduled: number
  listPagesFetched: number
  listingUrlsDiscovered: number
  detailPagesValidated: number
  validActiveYstmUrls: number
  publishedVisibleInAudit: number
  lootauraPublishedActiveTotal: number
  missingValidYstmUrls: number
  coveragePct: number | null
  observationCount: number
  overlapPrevented: boolean
  expiredObsSeenAgain: number
  expiredObsRefreshScheduled: number
  postAuditReconcile: Awaited<ReturnType<typeof runPostAuditCoverageReconcile>> | null
}

export type YstmCoverageAuditCronResult = {
  ok: boolean
  telemetry: YstmCoverageAuditCronTelemetry
}

function buildConfigKey(city: string, state: string): string {
  return `${state}|${city}`
}

function buildListFootprintMatch(
  matchIndex: Awaited<ReturnType<typeof loadYstmCoverageLootAuraMatchIndex>>,
  canonicalUrl: string
) {
  return matchYstmCoverageLootAuraFootprint(matchIndex, {
    canonicalUrl,
    saleInstanceKey: null,
    sourceListingId: null,
    normalizedAddress: null,
    dateStart: null,
    dateEnd: null,
    identity: null,
  })
}

function buildDetailFootprintMatch(
  matchIndex: Awaited<ReturnType<typeof loadYstmCoverageLootAuraMatchIndex>>,
  input: {
    canonicalUrl: string
    sourceUrl: string
    state: string
    city: string
    parsed: import('@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml').YstmDetailPageParsed | null
  }
) {
  const normalizedAddress = input.parsed?.addressRaw
    ? input.parsed.addressRaw.toLowerCase().replace(/\s+/g, ' ').trim()
    : null
  const identity = computeYstmSaleInstanceIdentity({
    sourcePlatform: 'external_page_source',
    sourceUrl: input.sourceUrl,
    state: input.state,
    city: input.city,
    normalizedAddress,
    dateStart: input.parsed?.startDate ?? null,
    dateEnd: input.parsed?.endDate ?? null,
    title: input.parsed?.title ?? null,
    description: input.parsed?.description ?? null,
    imageSourceUrl: null,
    lat: input.parsed?.nativeCoords?.lat ?? null,
    lng: input.parsed?.nativeCoords?.lng ?? null,
    rawPayload: null,
  })

  return matchYstmCoverageLootAuraFootprint(matchIndex, {
    canonicalUrl: input.canonicalUrl,
    saleInstanceKey: identity?.sale_instance_key ?? null,
    sourceListingId: identity?.source_listing_id ?? null,
    normalizedAddress,
    dateStart: input.parsed?.startDate ?? null,
    dateEnd: input.parsed?.endDate ?? null,
    identity,
  })
}

/** Postgres upsert rejects duplicate conflict keys within a single INSERT batch. */
function dedupeDetailQueueByCanonical<
  T extends { canonicalUrl: string },
>(items: T[]): T[] {
  const byCanonical = new Map<string, T>()
  for (const item of items) {
    byCanonical.set(item.canonicalUrl, item)
  }
  return [...byCanonical.values()]
}

async function insertAuditRun(
  admin: ReturnType<typeof getAdminDb>,
  row: Record<string, unknown>
): Promise<string> {
  const { data, error } = await fromBase(admin, 'ystm_coverage_audit_runs').insert(row).select('id').single()
  if (error) {
    throw new Error(error.message)
  }
  return String((data as { id: string }).id)
}

async function completeAuditRun(
  admin: ReturnType<typeof getAdminDb>,
  runId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await fromBase(admin, 'ystm_coverage_audit_runs')
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) {
    throw new Error(error.message)
  }
}

function emptyAuditTelemetry(
  partial: Partial<YstmCoverageAuditCronTelemetry> & Pick<YstmCoverageAuditCronTelemetry, 'skipped' | 'skipReason'>
): YstmCoverageAuditCronTelemetry {
  return {
    bootstrapNationwide: false,
    tieredSchedulerEnabled: false,
    auditSelectionMode: null,
    configCursorBefore: 0,
    configCursorAfter: 0,
    longTailCursorBefore: null,
    longTailCursorAfter: null,
    tier1Scheduled: 0,
    tier2Scheduled: 0,
    listPagesFetched: 0,
    listingUrlsDiscovered: 0,
    detailPagesValidated: 0,
    validActiveYstmUrls: 0,
    publishedVisibleInAudit: 0,
    lootauraPublishedActiveTotal: 0,
    missingValidYstmUrls: 0,
    coveragePct: null,
    observationCount: 0,
    overlapPrevented: false,
    expiredObsSeenAgain: 0,
    expiredObsRefreshScheduled: 0,
    postAuditReconcile: null,
    ...partial,
  }
}

function resolveConfigEventOutcome(input: {
  pagesLength: number
  fetchStarted: boolean
  fetchCompleted: boolean
  fetchFailed: boolean
  urlsExtracted: number
  budgetExhaustedBeforeFetch: boolean
}): YstmCoverageAuditConfigEventOutcome {
  if (input.pagesLength === 0) {
    return 'skipped_no_pages'
  }
  if (input.budgetExhaustedBeforeFetch) {
    return 'budget_exhausted'
  }
  if (input.fetchFailed && input.urlsExtracted === 0) {
    return 'fetch_failed'
  }
  if (input.fetchStarted && !input.fetchCompleted && input.urlsExtracted === 0) {
    return 'budget_exhausted'
  }
  if (input.urlsExtracted === 0) {
    return 'zero_urls_extracted'
  }
  return 'ok_with_observations'
}

export async function runYstmCoverageAuditCron(
  admin: ReturnType<typeof getAdminDb>,
  options?: {
    budgets?: YstmCoverageAuditBudgets
    bootstrapEnabled?: boolean
    tieredSchedulerEnabled?: boolean
  }
): Promise<YstmCoverageAuditCronResult> {
  const bootstrapEnabled =
    options?.bootstrapEnabled ?? (await fetchCoverageBootstrapEnabled(admin))
  const tieredSchedulerEnabled =
    options?.tieredSchedulerEnabled ?? (await fetchCoverageTieredSchedulerEnabled(admin))
  const budgets = options?.budgets ?? parseYstmCoverageAuditBudgets(process.env, bootstrapEnabled)
  const logContext = { component: 'ingestion/ystmCoverage/runYstmCoverageAuditCron' }
  const startedMs = Date.now()

  const lease = await acquireIngestionOrchestrationLease(YSTM_COVERAGE_AUDIT_STATE_KEY, logContext, {
    includeLongTailCursor: tieredSchedulerEnabled,
  })
  if (!lease.acquired) {
    return {
      ok: true,
      telemetry: emptyAuditTelemetry({
        skipped: true,
        skipReason: lease.reason ?? 'active_lease',
        bootstrapNationwide: bootstrapEnabled,
        tieredSchedulerEnabled,
        configCursorBefore: lease.cursor,
        configCursorAfter: lease.cursor,
        longTailCursorBefore: lease.longTailCursor ?? null,
        longTailCursorAfter: lease.longTailCursor ?? null,
        overlapPrevented: true,
      }),
    }
  }

  const configCursorBefore = lease.cursor
  const longTailCursorBefore = tieredSchedulerEnabled ? (lease.longTailCursor ?? lease.cursor) : null
  let listPagesFetched = 0
  let listingUrlsDiscovered = 0
  let detailPagesValidated = 0
  let configCursorAfter = configCursorBefore
  let longTailCursorAfter = longTailCursorBefore ?? 0
  let tier1Scheduled = 0
  let tier2Scheduled = 0
  let runId: string | null = null
  let auditSelectionMode: YstmCoverageAuditSelectionMode | null = null
  let catalogSize = 0

  try {
    const matchIndex = await loadYstmCoverageLootAuraMatchIndex(admin)
    const { data: configData, error: configError } = await fromBase(admin, 'ingestion_city_configs')
      .select('id, city, state, source_platform, source_pages, source_crawl_excluded_at')
      .eq('enabled', true)
      .eq('source_platform', 'external_page_source')
    if (configError) {
      throw new Error(configError.message)
    }

    const partition = partitionCrawlableExternalCityConfigs((configData ?? []) as ExternalCityConfigRow[])
    const observationAggForOrder = await aggregateYstmCoverageObservations(admin)
    const configStalenessHoursByKey = tieredSchedulerEnabled
      ? await loadYstmCoverageConfigStalenessHoursByKey(admin, startedMs)
      : {}

    let orderedSlots: Array<{
      config: ExternalCityConfigRow
      tier: 1 | 2
      selectionIndex: number
    }> = []

    if (tieredSchedulerEnabled) {
      const { resolved, unresolvedSlugs } = resolveYstmStrategicMetroRegistry({
        crawlableConfigs: partition.crawlable,
      })
      if (unresolvedSlugs.length > 0) {
        logger.warn('YSTM tiered scheduler unresolved strategic metros', {
          ...logContext,
          unresolvedSlugs,
        })
      }
      const configVelocityWeightByKey = await loadYstmConfigVelocityWeightByKey(admin, startedMs)
      const tieredOrder = buildTieredYstmCoverageAuditConfigOrder({
        crawlableConfigs: partition.crawlable,
        resolvedStrategic: resolved,
        configStalenessHoursByKey,
        configVelocityWeightByKey,
        longTailCursorBefore: longTailCursorBefore ?? 0,
        maxConfigsPerRun: budgets.maxConfigsPerRun,
        nowMs: startedMs,
      })
      orderedSlots = tieredOrder.slots
      auditSelectionMode = tieredOrder.selectionMode
      tier1Scheduled = tieredOrder.tier1Scheduled
      tier2Scheduled = tieredOrder.tier2Scheduled
      longTailCursorAfter = tieredOrder.longTailCursorAfter
      catalogSize = partition.crawlable.length
    } else {
      const configOrder = buildYstmCoverageAuditConfigOrder({
        crawlableConfigs: partition.crawlable,
        observationAgg: observationAggForOrder,
        bootstrapEnabled,
        cursorBefore: configCursorBefore,
      })
      orderedSlots = configOrder.orderedConfigs.map((config, selectionIndex) => ({
        config,
        tier: 2 as const,
        selectionIndex,
      }))
      auditSelectionMode = configOrder.selectionMode
      catalogSize = configOrder.catalogSize
    }

    runId = await insertAuditRun(admin, {
      status: 'running',
      config_cursor_before: configCursorBefore,
      config_cursor_after: configCursorBefore,
      selection_mode: auditSelectionMode,
      tier1_scheduled: tier1Scheduled,
      tier2_scheduled: tier2Scheduled,
      long_tail_cursor_before: longTailCursorBefore,
      long_tail_cursor_after: longTailCursorBefore,
      lootaura_published_active_total: matchIndex.publishedActiveTotal,
    })

    if (catalogSize === 0) {
      const agg = await aggregateYstmCoverageObservations(admin)
      const coveragePct = computeCoveragePct({
        validActiveYstmUrls: agg.validActiveYstmUrls,
        publishedVisibleInAudit: agg.publishedVisibleInAudit,
      })
      await completeAuditRun(admin, runId, {
        status: 'completed',
        skip_reason: 'no_crawlable_configs',
        config_cursor_after: 0,
        valid_active_ystm_urls: agg.validActiveYstmUrls,
        published_visible_in_audit: agg.publishedVisibleInAudit,
        missing_valid_ystm_urls: agg.missingValidYstmUrls,
        coverage_pct: coveragePct,
        missing_by_state: agg.missingByState,
        missing_by_metro: agg.missingByMetro,
      })
      await releaseIngestionOrchestrationLease(YSTM_COVERAGE_AUDIT_STATE_KEY, logContext, {
        owner: lease.owner,
        nextCursor: 0,
        nextLongTailCursor: tieredSchedulerEnabled ? 0 : undefined,
        updateLegacyCursor: !tieredSchedulerEnabled,
        markCompleted: true,
      })
      const postAuditReconcile = bootstrapEnabled
        ? await runPostAuditCoverageReconcile(admin, { bootstrapEnabled: true })
        : null
      return {
        ok: true,
        telemetry: emptyAuditTelemetry({
          skipped: false,
          skipReason: 'no_crawlable_configs',
          bootstrapNationwide: bootstrapEnabled,
          tieredSchedulerEnabled,
          auditSelectionMode,
          configCursorBefore,
          configCursorAfter: 0,
          longTailCursorBefore,
          longTailCursorAfter: tieredSchedulerEnabled ? 0 : null,
          tier1Scheduled,
          tier2Scheduled,
          validActiveYstmUrls: agg.validActiveYstmUrls,
          publishedVisibleInAudit: agg.publishedVisibleInAudit,
          lootauraPublishedActiveTotal: matchIndex.publishedActiveTotal,
          missingValidYstmUrls: agg.missingValidYstmUrls,
          coveragePct,
          observationCount: agg.observationCount,
          postAuditReconcile,
        }),
      }
    }

    const listSeenAt = new Date().toISOString()
    const detailQueue: Array<{
      canonicalUrl: string
      sourceUrl: string
      city: string
      state: string
      configKey: string
    }> = []
    const pendingListEntries: Array<{
      canonicalUrl: string
      sourceUrl: string
      city: string
      state: string
      configKey: string
      metadata: import('@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales').YstmListMetadataSale | null
    }> = []
    const configEvents: YstmCoverageAuditConfigEventInsert[] = []
    let expiredObsSeenAgain = 0
    let expiredObsRefreshScheduled = 0

    let configsProcessed = 0
    let orderIndex = 0

    while (
      configsProcessed < budgets.maxConfigsPerRun &&
      orderIndex < orderedSlots.length &&
      listPagesFetched < budgets.maxListFetchesPerRun &&
      Date.now() - startedMs < budgets.maxRuntimeMs
    ) {
      const slot = orderedSlots[orderIndex]!
      orderIndex += 1
      const config = slot.config
      const pages = normalizeSourcePages(config.source_pages)
      let fetchStarted = false
      let fetchCompleted = false
      let fetchFailed = false
      let listFetchError: string | null = null
      let urlsExtractedForConfig = 0
      let budgetExhaustedBeforeFetch = false
      let listPageUrl: string | null = pages[0] ?? null

      if (pages.length === 0) {
        configEvents.push({
          auditRunId: runId,
          configId: config.id ?? null,
          tier: slot.tier,
          selectionIndex: slot.selectionIndex,
          city: config.city,
          state: config.state,
          listPageUrl: null,
          selected: true,
          fetchStarted: false,
          fetchCompleted: false,
          urlsExtracted: 0,
          observationsWritten: 0,
          outcome: 'skipped_no_pages',
          listFetchError: null,
        })
        configsProcessed += 1
        continue
      }

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        if (listPagesFetched >= budgets.maxListFetchesPerRun) {
          if (!fetchStarted) {
            budgetExhaustedBeforeFetch = true
          }
          break
        }
        if (Date.now() - startedMs >= budgets.maxRuntimeMs) {
          if (!fetchStarted) {
            budgetExhaustedBeforeFetch = true
          }
          break
        }

        const pageUrl = pages[pageIndex]!
        listPageUrl = pageUrl
        fetchStarted = true
        try {
          const html = await fetchSafeExternalPageHtml(pageUrl, {
            city: config.city,
            state: config.state,
            pageIndex,
            adapter: 'ystm_coverage_audit',
          })
          listPagesFetched += 1
          fetchCompleted = true
          const metadataSales = extractYstmListMetadataSales(html, pageUrl).slice(
            0,
            budgets.maxUrlsPerListPage
          )
          const metadataByUrl = new Map(metadataSales.map((sale) => [sale.canonicalUrl, sale]))
          const extracted = extractYstmListingUrlsFromListHtml(html, pageUrl).slice(
            0,
            budgets.maxUrlsPerListPage
          )
          listingUrlsDiscovered += extracted.length
          urlsExtractedForConfig += extracted.length
          const configKey = buildConfigKey(config.city, config.state)

          for (const item of extracted) {
            pendingListEntries.push({
              canonicalUrl: item.canonicalUrl,
              sourceUrl: item.sourceUrl,
              city: config.city,
              state: config.state,
              configKey,
              metadata: metadataByUrl.get(item.canonicalUrl) ?? null,
            })
            detailQueue.push({
              canonicalUrl: item.canonicalUrl,
              sourceUrl: item.sourceUrl,
              city: config.city,
              state: config.state,
              configKey,
            })
          }
        } catch (err) {
          fetchFailed = true
          listFetchError = err instanceof Error ? err.message : String(err)
          logger.warn('YSTM coverage audit list fetch failed', {
            ...logContext,
            city: config.city,
            state: config.state,
            pageIndex,
            message: listFetchError,
          })
        }
      }

      configEvents.push({
        auditRunId: runId,
        configId: config.id ?? null,
        tier: slot.tier,
        selectionIndex: slot.selectionIndex,
        city: config.city,
        state: config.state,
        listPageUrl,
        selected: true,
        fetchStarted,
        fetchCompleted,
        urlsExtracted: urlsExtractedForConfig,
        observationsWritten: urlsExtractedForConfig,
        outcome: resolveConfigEventOutcome({
          pagesLength: pages.length,
          fetchStarted,
          fetchCompleted,
          fetchFailed,
          urlsExtracted: urlsExtractedForConfig,
          budgetExhaustedBeforeFetch,
        }),
        listFetchError,
      })

      configsProcessed += 1
    }

    configCursorAfter =
      !tieredSchedulerEnabled && catalogSize > 0
        ? (configCursorBefore + configsProcessed) % catalogSize
        : configCursorBefore

    const dedupedPendingListEntries = dedupeDetailQueueByCanonical(pendingListEntries)
    const dedupedDetailQueue = dedupeDetailQueueByCanonical(detailQueue)
    const existingByUrl = await loadYstmCoverageObservationsForRelist(
      admin,
      dedupedPendingListEntries.map((entry) => entry.canonicalUrl)
    )

    const listOnlyUpserts: YstmCoverageObservationUpsert[] = []
    for (const entry of dedupedPendingListEntries) {
      const listMatch = buildListFootprintMatch(matchIndex, entry.canonicalUrl)
      const existing = existingByUrl.get(entry.canonicalUrl) ?? null
      if (existing?.ystmInvalidReason === 'expired') {
        expiredObsSeenAgain += 1
      }

      if (entry.metadata) {
        const upsert = buildYstmListSightObservationUpsert({
          sale: entry.metadata,
          city: entry.city,
          state: entry.state,
          configKey: entry.configKey,
          listSeenAt,
          appearanceSource: 'coverage_audit',
          footprint: listMatch,
          existing,
          relistDetectedAt: listSeenAt,
          hotDiscovery: false,
        })
        if (upsert.needsDetailRefresh) {
          expiredObsRefreshScheduled += 1
        }
        listOnlyUpserts.push(upsert)
        continue
      }

      listOnlyUpserts.push(
        buildYstmAuditUrlListUpsert({
          canonicalUrl: entry.canonicalUrl,
          city: entry.city,
          state: entry.state,
          configKey: entry.configKey,
          listSeenAt,
          footprint: listMatch,
          existing,
        })
      )
    }

    const dedupedListUpserts = dedupeDetailQueueByCanonical(listOnlyUpserts)

    if (dedupedListUpserts.length > 0) {
      await upsertYstmCoverageObservations(admin, dedupedListUpserts)
    }

    if (configEvents.length > 0) {
      await insertYstmCoverageAuditConfigEvents(admin, configEvents)
    }

    const detailCheckedAt = new Date().toISOString()
    for (const item of dedupedDetailQueue) {
      if (detailPagesValidated >= budgets.maxDetailValidationsPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

      let ystmValidActive = false
      let ystmInvalidReason: YstmCoverageInvalidReason | null = null
      let parsed: import('@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml').YstmDetailPageParsed | null =
        null

      try {
        const html = await fetchSafeExternalPageHtml(item.sourceUrl, {
          city: item.city,
          state: item.state,
          pageIndex: 0,
          adapter: 'ystm_coverage_audit',
        })
        parsed = parseYstmDetailPageFromHtml({
          html,
          sourceUrl: item.sourceUrl,
          configCity: item.city,
          configState: item.state,
        })
        const validity = classifyYstmDetailAsValidActive({ parsed, html })
        ystmValidActive = validity.valid
        if (!validity.valid) {
          ystmInvalidReason = validity.reason
        }
        detailPagesValidated += 1
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ystmInvalidReason = classifyFetchErrorForCoverage(msg)
        detailPagesValidated += 1
      }

      const footprintMatch = buildDetailFootprintMatch(matchIndex, {
        canonicalUrl: item.canonicalUrl,
        sourceUrl: item.sourceUrl,
        state: item.state,
        city: item.city,
        parsed,
      })

      await upsertYstmCoverageObservations(admin, [
        {
          canonicalUrl: item.canonicalUrl,
          state: item.state,
          city: item.city,
          configKey: item.configKey,
          ystmValidActive,
          ystmInvalidReason,
          lootauraVisible: footprintMatch.lootauraVisible,
          listSeenAt,
          detailCheckedAt,
          sourceListingId: footprintMatch.sourceListingId,
          saleInstanceKey: footprintMatch.saleInstanceKey,
          matchedIngestedSaleId: footprintMatch.matchedIngestedSaleId,
          matchedSaleId: footprintMatch.matchedSaleId,
          matchMethod: footprintMatch.matchMethod,
        },
      ])
    }

    const agg = await aggregateYstmCoverageObservations(admin)
    const coveragePct = computeCoveragePct({
      validActiveYstmUrls: agg.validActiveYstmUrls,
      publishedVisibleInAudit: agg.publishedVisibleInAudit,
    })

    await completeAuditRun(admin, runId, {
      status: 'completed',
      config_cursor_after: configCursorAfter,
      selection_mode: auditSelectionMode,
      tier1_scheduled: tier1Scheduled,
      tier2_scheduled: tier2Scheduled,
      long_tail_cursor_before: longTailCursorBefore,
      long_tail_cursor_after: tieredSchedulerEnabled ? longTailCursorAfter : null,
      list_pages_fetched: listPagesFetched,
      listing_urls_discovered: listingUrlsDiscovered,
      detail_pages_validated: detailPagesValidated,
      valid_active_ystm_urls: agg.validActiveYstmUrls,
      published_visible_in_audit: agg.publishedVisibleInAudit,
      lootaura_published_active_total: matchIndex.publishedActiveTotal,
      missing_valid_ystm_urls: agg.missingValidYstmUrls,
      coverage_pct: coveragePct,
      missing_by_state: agg.missingByState,
      missing_by_metro: agg.missingByMetro,
    })

    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_AUDIT_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: configCursorAfter,
      nextLongTailCursor: tieredSchedulerEnabled ? longTailCursorAfter : undefined,
      updateLegacyCursor: !tieredSchedulerEnabled,
      markCompleted: true,
    })

    const postAuditReconcile = bootstrapEnabled
      ? await runPostAuditCoverageReconcile(admin, { bootstrapEnabled: true })
      : null

    return {
      ok: true,
      telemetry: emptyAuditTelemetry({
        skipped: false,
        skipReason: null,
        bootstrapNationwide: bootstrapEnabled,
        tieredSchedulerEnabled,
        auditSelectionMode,
        configCursorBefore,
        configCursorAfter,
        longTailCursorBefore,
        longTailCursorAfter: tieredSchedulerEnabled ? longTailCursorAfter : null,
        tier1Scheduled,
        tier2Scheduled,
        listPagesFetched,
        listingUrlsDiscovered,
        detailPagesValidated,
        validActiveYstmUrls: agg.validActiveYstmUrls,
        publishedVisibleInAudit: agg.publishedVisibleInAudit,
        lootauraPublishedActiveTotal: matchIndex.publishedActiveTotal,
        missingValidYstmUrls: agg.missingValidYstmUrls,
        coveragePct,
        observationCount: agg.observationCount,
        expiredObsSeenAgain,
        expiredObsRefreshScheduled,
        postAuditReconcile,
      }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('YSTM coverage audit cron failed', err instanceof Error ? err : new Error(message), logContext)
    if (runId) {
      try {
        await completeAuditRun(admin, runId, {
          status: 'skipped',
          skip_reason: 'error',
          config_cursor_after: configCursorAfter,
          list_pages_fetched: listPagesFetched,
          listing_urls_discovered: listingUrlsDiscovered,
          detail_pages_validated: detailPagesValidated,
        })
      } catch {
        /* best effort */
      }
    }
    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_AUDIT_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: configCursorAfter,
      nextLongTailCursor: tieredSchedulerEnabled ? longTailCursorAfter : undefined,
      updateLegacyCursor: !tieredSchedulerEnabled,
      markCompleted: false,
    })
    throw err
  }
}
