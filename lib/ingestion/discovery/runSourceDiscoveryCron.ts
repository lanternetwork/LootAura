import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { partitionCrawlableExternalCityConfigs } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { parseDiscoveryCronBudgets } from '@/lib/ingestion/discovery/discoveryCronConfig'
import {
  acquireDiscoveryOrchestrationLease,
  releaseDiscoveryOrchestrationLease,
} from '@/lib/ingestion/discovery/discoveryOrchestrationLease'
import { pickDiscoveryStateBatch } from '@/lib/ingestion/discovery/discoveryStateCursor'
import {
  computeRepairRate,
  createDiscoveryCronTelemetry,
  emitDiscoveryCronCompleted,
  type DiscoveryCronTelemetry,
} from '@/lib/ingestion/discovery/discoveryCronTelemetry'
import { promoteSourceDiscoveryResults } from '@/lib/ingestion/discovery/promoteSourceDiscoveryResults'
import { revalidateSourceDiscoveryConfigs } from '@/lib/ingestion/discovery/revalidateSourceDiscoveryConfigs'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import type { ValidatedDiscoveryCandidate } from '@/lib/ingestion/discovery/sourceDiscovery'
import { runYstmGraphEnumerationDiscovery } from '@/lib/ingestion/discovery/runYstmGraphEnumerationDiscovery'
import {
  listValidatedUnpromotedCandidates,
  markSourcePageCandidatesPromoted,
} from '@/lib/ingestion/discovery/ystmSourcePageCandidatesStore'
import { generateOperationId, logger } from '@/lib/log'

type AdminDb = ReturnType<typeof getAdminDb>

export type RunSourceDiscoveryCronArgs = {
  budgets?: ReturnType<typeof parseDiscoveryCronBudgets>
  telemetryContext?: Record<string, unknown>
  leaseOwner?: string
}

export type RunSourceDiscoveryCronResult = {
  ok: boolean
  skipped: boolean
  skipReason?: string
  telemetry: DiscoveryCronTelemetry
}

function isRuntimeBudgetExceeded(startedAtMs: number, maxRuntimeMs: number): boolean {
  if (maxRuntimeMs <= 0) return true
  return Date.now() - startedAtMs >= maxRuntimeMs
}

async function loadRegistryAggregateCounts(admin: AdminDb): Promise<{
  crawlableConfigCount: number
  failedConfigCount: number
  crawlExcludedConfigCount: number
}> {
  const { data, error } = await fromBase(admin, 'ingestion_city_configs')
    .select('city, state, source_platform, source_pages, source_discovery_status, source_crawl_excluded_at')
    .eq('enabled', true)
    .eq('source_platform', 'external_page_source')

  if (error || !data) {
    return { crawlableConfigCount: 0, failedConfigCount: 0, crawlExcludedConfigCount: 0 }
  }

  const rows = data as Array<{
    city: string
    state: string
    source_platform: string
    source_pages: unknown
    source_discovery_status: string
    source_crawl_excluded_at: string | null
  }>

  let crawlExcludedConfigCount = 0
  let failedConfigCount = 0
  for (const row of rows) {
    if (row.source_crawl_excluded_at) crawlExcludedConfigCount += 1
    if (row.source_discovery_status === SOURCE_DISCOVERY_STATUS.failed) failedConfigCount += 1
  }

  const partition = partitionCrawlableExternalCityConfigs(rows)
  return {
    crawlableConfigCount: partition.configsCrawlable,
    failedConfigCount,
    crawlExcludedConfigCount,
  }
}

/**
 * Nationwide discovery cron: bounded discovery → promotion → revalidation/healing.
 * Uses persisted state cursor + lease overlap prevention.
 */
export async function runSourceDiscoveryCron(
  admin: AdminDb,
  args: RunSourceDiscoveryCronArgs = {}
): Promise<RunSourceDiscoveryCronResult> {
  const startedAtMs = Date.now()
  const budgets = args.budgets ?? parseDiscoveryCronBudgets()
  const telemetry = createDiscoveryCronTelemetry()
  const owner = args.leaseOwner ?? generateOperationId()
  const telemetryContext = {
    jobType: 'cron.discovery.external_source',
    ...args.telemetryContext,
  }

  const lease = await acquireDiscoveryOrchestrationLease(admin, owner, budgets.leaseSeconds)
  telemetry.stateCursorBefore = lease.stateCursor
  telemetry.staleLockRecovered = lease.staleRecovered

  if (!lease.acquired) {
    telemetry.overlapPrevented = lease.reason === 'active_lease' || lease.reason === 'lost_race'
    telemetry.discoveryLatencyMs = Date.now() - startedAtMs
    emitDiscoveryCronCompleted(telemetry, { ok: false, skipped: true, reason: lease.reason, ...telemetryContext })
    return {
      ok: true,
      skipped: true,
      skipReason: lease.reason,
      telemetry,
    }
  }

  const batch = pickDiscoveryStateBatch(lease.stateCursor, budgets.maxStatesPerRun)
  telemetry.catalogSize = batch.catalogSize
  telemetry.stateCursorAfter = batch.nextCursor

  try {
    if (batch.states.length === 0 && batch.catalogSize > 0) {
      telemetry.degraded = true
      telemetry.graphEnumerationSkippedReason = 'empty_state_batch'
      logger.warn('discovery cron empty state batch with non-empty catalog', {
        component: 'ingestion/discovery/runSourceDiscoveryCron',
        operation: 'pick_state_batch',
        catalogSize: batch.catalogSize,
        stateCursorBefore: lease.stateCursor,
        maxStatesPerRun: budgets.maxStatesPerRun,
        ...telemetryContext,
      })
    } else if (isRuntimeBudgetExceeded(startedAtMs, budgets.maxRuntimeMs)) {
      telemetry.graphEnumerationSkippedReason = 'runtime_budget'
      telemetry.degraded = true
    }

    if (batch.states.length > 0 && !isRuntimeBudgetExceeded(startedAtMs, budgets.maxRuntimeMs)) {
      const graph = await runYstmGraphEnumerationDiscovery(admin, {
        stateCodes: batch.states,
        budgets,
        telemetryContext,
      })

      telemetry.statesScanned = graph.telemetry.statesScanned
      telemetry.candidatePagesDiscovered = graph.telemetry.candidatePagesDiscovered
      telemetry.candidatePagesValid = graph.telemetry.candidatePagesValid
      telemetry.candidatePagesInvalid = graph.telemetry.candidatePagesInvalid
      telemetry.candidateRegistryUpserts = graph.telemetry.candidateRegistryUpserts
      telemetry.graphEnumerationValidations = graph.telemetry.validationsAttempted
      telemetry.graphEnumerationThrottled = graph.telemetry.throttleApplied
      telemetry.phasesCompleted.push('graph_enumeration')

      if (graph.ok && !isRuntimeBudgetExceeded(startedAtMs, budgets.maxRuntimeMs)) {
        const backlogRows = await listValidatedUnpromotedCandidates(admin, 500)
        const backlogPromotable: ValidatedDiscoveryCandidate[] = backlogRows.map((row) => ({
          city: typeof row.metadata?.city === 'string' ? row.metadata.city : row.city_slug ?? row.state,
          state: row.state,
          statePathSegment: row.state,
          canonicalUrl: row.canonical_url,
          sharedHubPage: row.metadata?.sharedHubPage === true,
          cityPathSegment: row.city_slug ? `${row.city_slug}.html` : 'city.html',
          validation: { ok: true as const, kind: 'valid_city_page' as const },
        }))
        const promotableByUrl = new Map<string, ValidatedDiscoveryCandidate>()
        for (const c of [...graph.promotable, ...backlogPromotable]) {
          promotableByUrl.set(c.canonicalUrl, c)
        }
        const promotable = [...promotableByUrl.values()]

        const promotion = await promoteSourceDiscoveryResults(admin, {
          dryRun: false,
          candidates: promotable,
          telemetryContext,
        })
        if (promotion.ok) {
          telemetry.configsPromoted = promotion.telemetry.configsPromoted
          telemetry.configsRepaired += promotion.telemetry.configsRepaired
          telemetry.phasesCompleted.push('promote')
          const promotionMarks = promotion.records
            .filter(
              (record): record is typeof record & { configId: string } =>
                (record.action === 'inserted' || record.action === 'updated') &&
                typeof record.configId === 'string' &&
                record.configId.length > 0
            )
            .map((record) => ({
              canonicalUrl: record.canonicalUrl,
              promotedConfigId: record.configId,
            }))
          await markSourcePageCandidatesPromoted(admin, promotionMarks)
        } else {
          telemetry.degraded = true
          logger.warn('source discovery cron promotion degraded', {
            component: 'ingestion/discovery/runSourceDiscoveryCron',
            operation: 'promote',
            message: promotion.error,
            ...telemetryContext,
          })
        }
      } else if (!graph.ok) {
        telemetry.degraded = true
        telemetry.graphEnumerationSkippedReason = 'graph_enumeration_failed'
      }
    }

    if (!isRuntimeBudgetExceeded(startedAtMs, budgets.maxRuntimeMs)) {
      const revalidationStates = batch.states.length > 0 ? batch.states : undefined

      const placeholderRepair = await revalidateSourceDiscoveryConfigs(admin, {
        dryRun: false,
        maxConfigsPerRun: budgets.maxPlaceholderRepairConfigsPerRun,
        selectionMode: 'no_source_pages_only',
        placeholderFailureExcludeThreshold: budgets.placeholderFailureExcludeThreshold,
        telemetryContext: { ...telemetryContext, phase: 'placeholder_repair' },
      })
      if (placeholderRepair.ok) {
        telemetry.placeholderRepairRepaired += placeholderRepair.telemetry.configsRepaired
        telemetry.placeholderRepairFailed += placeholderRepair.telemetry.configsFailed
        telemetry.configsRepaired += placeholderRepair.telemetry.configsRepaired
        telemetry.configsFailed += placeholderRepair.telemetry.configsFailed
        telemetry.placeholdersUnresolved += placeholderRepair.telemetry.placeholdersUnresolved
        telemetry.phasesCompleted.push('placeholder_repair')
      } else {
        telemetry.degraded = true
      }

      const revalidation = await revalidateSourceDiscoveryConfigs(admin, {
        dryRun: false,
        states: revalidationStates,
        maxConfigsPerRun: budgets.maxRevalidationConfigsPerRun,
        selectionMode: 'balanced',
        placeholderFailureExcludeThreshold: budgets.placeholderFailureExcludeThreshold,
        telemetryContext,
      })
      if (revalidation.ok) {
        telemetry.configsRevalidated = revalidation.telemetry.configsRevalidated
        telemetry.configsRepaired += revalidation.telemetry.configsRepaired
        telemetry.configsFailed = revalidation.telemetry.configsFailed
        telemetry.placeholdersUnresolved = revalidation.telemetry.placeholdersUnresolved
        telemetry.phasesCompleted.push('revalidate')
      } else {
        telemetry.degraded = true
      }
    } else {
      telemetry.degraded = true
    }

    const registryCounts = await loadRegistryAggregateCounts(admin)
    telemetry.crawlableConfigCount = registryCounts.crawlableConfigCount
    telemetry.failedConfigCount = registryCounts.failedConfigCount
    telemetry.crawlExcludedConfigCount = registryCounts.crawlExcludedConfigCount
    telemetry.repairRate = computeRepairRate(telemetry.configsRepaired, telemetry.configsRevalidated)
    telemetry.discoveryLatencyMs = Date.now() - startedAtMs

    await releaseDiscoveryOrchestrationLease(admin, {
      owner,
      nextStateCursor: batch.nextCursor,
      markCompleted: true,
    })

    emitDiscoveryCronCompleted(telemetry, { ok: true, skipped: false, ...telemetryContext })
    return { ok: true, skipped: false, telemetry }
  } catch (e) {
    telemetry.degraded = true
    telemetry.discoveryLatencyMs = Date.now() - startedAtMs
    const message = e instanceof Error ? e.message : String(e)
    logger.error('source discovery cron failed', e instanceof Error ? e : new Error(message), {
      component: 'ingestion/discovery/runSourceDiscoveryCron',
      operation: 'run',
      ...telemetryContext,
    })
    await releaseDiscoveryOrchestrationLease(admin, {
      owner,
      nextStateCursor: lease.stateCursor,
      markCompleted: false,
    })
    emitDiscoveryCronCompleted(telemetry, { ok: false, skipped: false, reason: 'run_failed', ...telemetryContext })
    return { ok: false, skipped: false, telemetry }
  }
}
