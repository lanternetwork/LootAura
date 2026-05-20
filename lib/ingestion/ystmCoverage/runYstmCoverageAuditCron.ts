import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import {
  parseYstmCoverageAuditBudgets,
  YSTM_COVERAGE_AUDIT_STATE_KEY,
  type YstmCoverageAuditBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageAuditConfig'
import { extractYstmListingUrlsFromListHtml } from '@/lib/ingestion/ystmCoverage/extractYstmListingUrlsFromListHtml'
import {
  aggregateYstmCoverageObservations,
  upsertYstmCoverageObservations,
  type YstmCoverageObservationUpsert,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
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
import { partitionCrawlableExternalCityConfigs } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type YstmCoverageAuditCronTelemetry = {
  skipped: boolean
  skipReason: string | null
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
}

export type YstmCoverageAuditCronResult = {
  ok: boolean
  telemetry: YstmCoverageAuditCronTelemetry
}

type CrawlConfig = {
  city: string
  state: string
  source_pages: unknown
}

function sortConfigsDeterministic(rows: CrawlConfig[]): CrawlConfig[] {
  return [...rows].sort((a, b) => {
    const ak = `${a.state || ''}|${a.city || ''}`.toLowerCase()
    const bk = `${b.state || ''}|${b.city || ''}`.toLowerCase()
    return ak.localeCompare(bk)
  })
}

function buildConfigKey(city: string, state: string): string {
  return `${state}|${city}`
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

export async function runYstmCoverageAuditCron(
  admin: ReturnType<typeof getAdminDb>,
  options?: { budgets?: YstmCoverageAuditBudgets }
): Promise<YstmCoverageAuditCronResult> {
  const budgets = options?.budgets ?? parseYstmCoverageAuditBudgets()
  const logContext = { component: 'ingestion/ystmCoverage/runYstmCoverageAuditCron' }
  const startedMs = Date.now()

  const lease = await acquireIngestionOrchestrationLease(YSTM_COVERAGE_AUDIT_STATE_KEY, logContext)
  if (!lease.acquired) {
    return {
      ok: true,
      telemetry: {
        skipped: true,
        skipReason: lease.reason ?? 'active_lease',
        configCursorBefore: lease.cursor,
        configCursorAfter: lease.cursor,
        listPagesFetched: 0,
        listingUrlsDiscovered: 0,
        detailPagesValidated: 0,
        validActiveYstmUrls: 0,
        publishedVisibleInAudit: 0,
        lootauraPublishedActiveTotal: 0,
        missingValidYstmUrls: 0,
        coveragePct: null,
        observationCount: 0,
        overlapPrevented: true,
      },
    }
  }

  const configCursorBefore = lease.cursor
  let listPagesFetched = 0
  let listingUrlsDiscovered = 0
  let detailPagesValidated = 0
  let configCursorAfter = configCursorBefore
  let runId: string | null = null

  try {
    const publishedIndex = await loadLootAuraPublishedYstmIndex(admin)
    const { data: configData, error: configError } = await fromBase(admin, 'ingestion_city_configs')
      .select('city, state, source_platform, source_pages, source_crawl_excluded_at')
      .eq('enabled', true)
      .eq('source_platform', 'external_page_source')
    if (configError) {
      throw new Error(configError.message)
    }

    const partition = partitionCrawlableExternalCityConfigs((configData ?? []) as CrawlConfig[])
    const sorted = sortConfigsDeterministic(partition.crawlable as CrawlConfig[])
    const catalogSize = sorted.length

    runId = await insertAuditRun(admin, {
      status: 'running',
      config_cursor_before: configCursorBefore,
      config_cursor_after: configCursorBefore,
      lootaura_published_active_total: publishedIndex.publishedActiveTotal,
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
      return {
        ok: true,
        telemetry: {
          skipped: false,
          skipReason: 'no_crawlable_configs',
          configCursorBefore,
          configCursorAfter: 0,
          listPagesFetched: 0,
          listingUrlsDiscovered: 0,
          detailPagesValidated: 0,
          validActiveYstmUrls: agg.validActiveYstmUrls,
          publishedVisibleInAudit: agg.publishedVisibleInAudit,
          lootauraPublishedActiveTotal: publishedIndex.publishedActiveTotal,
          missingValidYstmUrls: agg.missingValidYstmUrls,
          coveragePct,
          observationCount: agg.observationCount,
          overlapPrevented: false,
        },
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
    let cursor = configCursorBefore % catalogSize

    while (
      configsProcessed < budgets.maxConfigsPerRun &&
      listPagesFetched < budgets.maxListFetchesPerRun &&
      Date.now() - startedMs < budgets.maxRuntimeMs
    ) {
      const config = sorted[cursor]!
      const pages = normalizeSourcePages(config.source_pages)
      if (pages.length === 0) {
        cursor = (cursor + 1) % catalogSize
        configsProcessed += 1
        continue
      }

      const pageUrl = pages[0]!
      try {
        const html = await fetchSafeExternalPageHtml(pageUrl, {
          city: config.city,
          state: config.state,
          pageIndex: 0,
          adapter: 'ystm_coverage_audit',
        })
        listPagesFetched += 1
        const extracted = extractYstmListingUrlsFromListHtml(html, pageUrl).slice(
          0,
          budgets.maxUrlsPerListPage
        )
        listingUrlsDiscovered += extracted.length

        for (const item of extracted) {
          const visible = publishedIndex.visibleCanonicalUrls.has(item.canonicalUrl)
          listOnlyUpserts.push({
            canonicalUrl: item.canonicalUrl,
            state: config.state,
            city: config.city,
            configKey: buildConfigKey(config.city, config.state),
            ystmValidActive: false,
            ystmInvalidReason: null,
            lootauraVisible: visible,
            listSeenAt,
            detailCheckedAt: null,
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
          message: err instanceof Error ? err.message : String(err),
        })
      }

      cursor = (cursor + 1) % catalogSize
      configsProcessed += 1
    }

    configCursorAfter = cursor

    if (listOnlyUpserts.length > 0) {
      await upsertYstmCoverageObservations(admin, listOnlyUpserts)
    }

    const detailCheckedAt = new Date().toISOString()
    for (const item of detailQueue) {
      if (detailPagesValidated >= budgets.maxDetailValidationsPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

      let ystmValidActive = false
      let ystmInvalidReason: YstmCoverageInvalidReason | null = null
      const lootauraVisible = publishedIndex.visibleCanonicalUrls.has(item.canonicalUrl)

      try {
        const html = await fetchSafeExternalPageHtml(item.sourceUrl, {
          city: item.city,
          state: item.state,
          pageIndex: 0,
          adapter: 'ystm_coverage_audit',
        })
        const parsed = parseYstmDetailPageFromHtml({
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

      await upsertYstmCoverageObservations(admin, [
        {
          canonicalUrl: item.canonicalUrl,
          state: item.state,
          city: item.city,
          configKey: item.configKey,
          ystmValidActive,
          ystmInvalidReason,
          lootauraVisible,
          listSeenAt,
          detailCheckedAt,
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
      lootaura_published_active_total: publishedIndex.publishedActiveTotal,
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

    return {
      ok: true,
      telemetry: {
        skipped: false,
        skipReason: null,
        configCursorBefore,
        configCursorAfter,
        listPagesFetched,
        listingUrlsDiscovered,
        detailPagesValidated,
        validActiveYstmUrls: agg.validActiveYstmUrls,
        publishedVisibleInAudit: agg.publishedVisibleInAudit,
        lootauraPublishedActiveTotal: publishedIndex.publishedActiveTotal,
        missingValidYstmUrls: agg.missingValidYstmUrls,
        coveragePct,
        observationCount: agg.observationCount,
        overlapPrevented: false,
      },
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
