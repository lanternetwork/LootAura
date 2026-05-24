import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { fetchCoverageBootstrapEnabled } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
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
  aggregateYstmCoverageObservations,
  upsertYstmCoverageObservations,
  type YstmCoverageObservationUpsert,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
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
  auditSelectionMode: YstmCoverageAuditSelectionMode | null
  configCursorBefore: number
  configCursorAfter: number
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
    auditSelectionMode: null,
    configCursorBefore: 0,
    configCursorAfter: 0,
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
    postAuditReconcile: null,
    ...partial,
  }
}

export async function runYstmCoverageAuditCron(
  admin: ReturnType<typeof getAdminDb>,
  options?: { budgets?: YstmCoverageAuditBudgets; bootstrapEnabled?: boolean }
): Promise<YstmCoverageAuditCronResult> {
  const bootstrapEnabled =
    options?.bootstrapEnabled ?? (await fetchCoverageBootstrapEnabled(admin))
  const budgets = options?.budgets ?? parseYstmCoverageAuditBudgets(process.env, bootstrapEnabled)
  const logContext = { component: 'ingestion/ystmCoverage/runYstmCoverageAuditCron' }
  const startedMs = Date.now()

  const lease = await acquireIngestionOrchestrationLease(YSTM_COVERAGE_AUDIT_STATE_KEY, logContext)
  if (!lease.acquired) {
    return {
      ok: true,
      telemetry: emptyAuditTelemetry({
        skipped: true,
        skipReason: lease.reason ?? 'active_lease',
        bootstrapNationwide: bootstrapEnabled,
        configCursorBefore: lease.cursor,
        configCursorAfter: lease.cursor,
        overlapPrevented: true,
      }),
    }
  }

  const configCursorBefore = lease.cursor
  let listPagesFetched = 0
  let listingUrlsDiscovered = 0
  let detailPagesValidated = 0
  let configCursorAfter = configCursorBefore
  let runId: string | null = null
  let auditSelectionMode: YstmCoverageAuditSelectionMode | null = null

  try {
    const matchIndex = await loadYstmCoverageLootAuraMatchIndex(admin)
    const { data: configData, error: configError } = await fromBase(admin, 'ingestion_city_configs')
      .select('city, state, source_platform, source_pages, source_crawl_excluded_at')
      .eq('enabled', true)
      .eq('source_platform', 'external_page_source')
    if (configError) {
      throw new Error(configError.message)
    }

    const partition = partitionCrawlableExternalCityConfigs((configData ?? []) as ExternalCityConfigRow[])
    const observationAggForOrder = await aggregateYstmCoverageObservations(admin)
    const configOrder = buildYstmCoverageAuditConfigOrder({
      crawlableConfigs: partition.crawlable,
      observationAgg: observationAggForOrder,
      bootstrapEnabled,
      cursorBefore: configCursorBefore,
    })
    const orderedConfigs = configOrder.orderedConfigs
    auditSelectionMode = configOrder.selectionMode
    const catalogSize = configOrder.catalogSize

    runId = await insertAuditRun(admin, {
      status: 'running',
      config_cursor_before: configCursorBefore,
      config_cursor_after: configCursorBefore,
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
          auditSelectionMode,
          configCursorBefore,
          configCursorAfter: 0,
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
    const listOnlyUpserts: YstmCoverageObservationUpsert[] = []

    let configsProcessed = 0
    let orderIndex = 0

    while (
      configsProcessed < budgets.maxConfigsPerRun &&
      orderIndex < orderedConfigs.length &&
      listPagesFetched < budgets.maxListFetchesPerRun &&
      Date.now() - startedMs < budgets.maxRuntimeMs
    ) {
      const config = orderedConfigs[orderIndex]!
      orderIndex += 1
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
            adapter: 'ystm_coverage_audit',
          })
          listPagesFetched += 1
          const extracted = extractYstmListingUrlsFromListHtml(html, pageUrl).slice(
            0,
            budgets.maxUrlsPerListPage
          )
          listingUrlsDiscovered += extracted.length

          for (const item of extracted) {
            const listMatch = buildListFootprintMatch(matchIndex, item.canonicalUrl)
            listOnlyUpserts.push({
              canonicalUrl: item.canonicalUrl,
              state: config.state,
              city: config.city,
              configKey: buildConfigKey(config.city, config.state),
              ystmValidActive: false,
              ystmInvalidReason: null,
              lootauraVisible: listMatch.lootauraVisible,
              listSeenAt,
              detailCheckedAt: null,
              sourceListingId: listMatch.sourceListingId,
              saleInstanceKey: listMatch.saleInstanceKey,
              matchedIngestedSaleId: listMatch.matchedIngestedSaleId,
              matchedSaleId: listMatch.matchedSaleId,
              matchMethod: listMatch.matchMethod,
            })
            detailQueue.push({
              canonicalUrl: item.canonicalUrl,
              sourceUrl: item.sourceUrl,
              city: config.city,
              state: config.state,
              configKey: buildConfigKey(config.city, config.state),
            })
          }
        } catch (err) {
          logger.warn('YSTM coverage audit list fetch failed', {
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

    configCursorAfter = catalogSize > 0 ? (configCursorBefore + configsProcessed) % catalogSize : 0

    const dedupedListUpserts = dedupeDetailQueueByCanonical(listOnlyUpserts)
    const dedupedDetailQueue = dedupeDetailQueueByCanonical(detailQueue)

    if (dedupedListUpserts.length > 0) {
      await upsertYstmCoverageObservations(admin, dedupedListUpserts)
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
        auditSelectionMode,
        configCursorBefore,
        configCursorAfter,
        listPagesFetched,
        listingUrlsDiscovered,
        detailPagesValidated,
        validActiveYstmUrls: agg.validActiveYstmUrls,
        publishedVisibleInAudit: agg.publishedVisibleInAudit,
        lootauraPublishedActiveTotal: matchIndex.publishedActiveTotal,
        missingValidYstmUrls: agg.missingValidYstmUrls,
        coveragePct,
        observationCount: agg.observationCount,
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
      markCompleted: false,
    })
    throw err
  }
}
