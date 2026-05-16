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
import { promoteYstmDiscoveryResults } from '@/lib/ingestion/discovery/promoteYstmDiscoveryResults'
import { revalidateYstmConfigs } from '@/lib/ingestion/discovery/revalidateYstmConfigs'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import { runYstmDiscoveryDryRun } from '@/lib/ingestion/discovery/ystmDiscovery'
import { generateOperationId, logger } from '@/lib/log'

type AdminDb = ReturnType<typeof getAdminDb>

export type RunYstmDiscoveryCronArgs = {
  budgets?: ReturnType<typeof parseDiscoveryCronBudgets>
  telemetryContext?: Record<string, unknown>
  leaseOwner?: string
}

export type RunYstmDiscoveryCronResult = {
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
export async function runYstmDiscoveryCron(
  admin: AdminDb,
  args: RunYstmDiscoveryCronArgs = {}
): Promise<RunYstmDiscoveryCronResult> {
  const startedAtMs = Date.now()
  const budgets = args.budgets ?? parseDiscoveryCronBudgets()
  const telemetry = createDiscoveryCronTelemetry()
  const owner = args.leaseOwner ?? generateOperationId()
  const telemetryContext = {
    jobType: 'cron.discovery.ystm',
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
    if (batch.states.length > 0 && !isRuntimeBudgetExceeded(startedAtMs, budgets.maxRuntimeMs)) {
      const discovery = await runYstmDiscoveryDryRun({
        dryRun: true,
        states: batch.states,
        maxStatesPerRun: budgets.maxStatesPerRun,
        maxDiscoveredPagesPerRun: budgets.maxDiscoveredPagesPerRun,
        maxValidationFetchesPerRun: budgets.maxValidationFetchesPerRun,
        telemetryContext,
      })

      telemetry.statesScanned = discovery.statesScanned
      telemetry.candidatePagesDiscovered = discovery.candidatePagesDiscovered
      telemetry.candidatePagesValid = discovery.candidatePagesValid
      telemetry.candidatePagesInvalid = discovery.candidatePagesInvalid
      telemetry.phasesCompleted.push('discover')

      if (discovery.ok && !isRuntimeBudgetExceeded(startedAtMs, budgets.maxRuntimeMs)) {
        const promotable = discovery.candidates.filter((c) => c.validation.ok === true)
        const promotion = await promoteYstmDiscoveryResults(admin, {
          dryRun: false,
          candidates: promotable,
          telemetryContext,
        })
        if (promotion.ok) {
          telemetry.configsPromoted = promotion.telemetry.configsPromoted
          telemetry.configsRepaired += promotion.telemetry.configsRepaired
          telemetry.phasesCompleted.push('promote')
        } else {
          telemetry.degraded = true
          logger.warn('ystm discovery cron promotion degraded', {
            component: 'ingestion/discovery/runYstmDiscoveryCron',
            operation: 'promote',
            message: promotion.error,
            ...telemetryContext,
          })
        }
      } else if (!discovery.ok) {
        telemetry.degraded = true
      }
    }

    if (!isRuntimeBudgetExceeded(startedAtMs, budgets.maxRuntimeMs)) {
      const revalidationStates = batch.states.length > 0 ? batch.states : undefined
      const revalidation = await revalidateYstmConfigs(admin, {
        dryRun: false,
        states: revalidationStates,
        maxConfigsPerRun: budgets.maxRevalidationConfigsPerRun,
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
    logger.error('ystm discovery cron failed', e instanceof Error ? e : new Error(message), {
      component: 'ingestion/discovery/runYstmDiscoveryCron',
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
