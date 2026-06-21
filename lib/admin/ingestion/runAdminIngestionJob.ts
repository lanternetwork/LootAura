import type {
  AdminIngestionJobKey,
  AdminIngestionJobRunResponse,
  AdminIngestionJobRunStatus,
} from '@/lib/admin/ingestion/adminIngestionJobTypes'
import { formatAdminIngestionJobError } from '@/lib/admin/ingestion/formatAdminIngestionJobError'
import { runAdminShadowReplay } from '@/lib/admin/ingestion/runAdminShadowReplay'
import { runIngestionOrchestration } from '@/lib/ingestion/dailyIngestionOrchestration'
import { resolveAdaptiveThroughputForCron } from '@/lib/ingestion/adaptiveThroughputSignals'
import { runGeocodeCronPipeline } from '@/lib/ingestion/geocodeCronPipeline'
import { runWithGeocodePipelineLease } from '@/lib/ingestion/geocodePipelineLease'
import { runYstmCatalogRepairCron } from '@/lib/ingestion/ystmCoverage/runYstmCatalogRepairCron'
import { runYstmCoverageAuditCron } from '@/lib/ingestion/ystmCoverage/runYstmCoverageAuditCron'
import { runYstmFreshDiscoveryCron } from '@/lib/ingestion/ystmCoverage/runYstmFreshDiscoveryCron'
import { runYstmMissingUrlIngestionCron } from '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
import { resolveIngestionLaneContext } from '@/lib/ingestion/resolveIngestionLaneContext'
import { createCorrelationBundle } from '@/lib/observability/correlation'
import { generateOperationId } from '@/lib/log'
import { getAdminDb } from '@/lib/supabase/clients'

type AdminIngestionJobRunnerResult = {
  status: AdminIngestionJobRunStatus
  telemetry: Record<string, unknown>
  skipReason?: string
}

function missingIngestTelemetry(
  result: Awaited<ReturnType<typeof runYstmMissingUrlIngestionCron>>
): Record<string, unknown> {
  const t = result.telemetry
  return {
    ok: result.ok,
    skipped: t.skipped,
    skipReason: t.skipReason,
    queueTotal: t.queueTotal,
    candidatesScanned: t.candidatesScanned,
    published: t.published,
    ingested: t.ingested,
    failed: t.failed,
    listFastAttempts: t.listFastAttempts,
    listFastPublished: t.listFastPublished,
    listFastFailed: t.listFastFailed,
    hotQueueTotal: t.hotQueueTotal,
    coldQueueTotal: t.coldQueueTotal,
    overlapPrevented: t.overlapPrevented,
    detailFirstAttempted: result.detailFirstMetrics.attempted,
    detailFirstPublished: result.detailFirstMetrics.published,
    detailFirstFallback: result.detailFirstMetrics.fallback,
  }
}

function ystmCronTelemetry(
  result: { ok: boolean; telemetry: { skipped?: boolean; skipReason?: string | null } & Record<string, unknown> }
): Record<string, unknown> {
  return {
    ok: result.ok,
    ...result.telemetry,
  }
}

function catalogRepairTelemetry(
  result: Awaited<ReturnType<typeof runYstmCatalogRepairCron>>
): Record<string, unknown> {
  const t = result.telemetry
  return {
    ok: result.ok,
    skipped: t.skipped,
    skipReason: t.skipReason,
    queueTotal: t.queueTotal,
    candidatesScanned: t.candidatesScanned,
    repairAttempts: t.repairAttempts,
    published: t.published,
    geocoded: t.geocoded,
    failed: t.failed,
    overlapPrevented: t.overlapPrevented,
    detailFirstAttempted: result.detailFirstMetrics.attempted,
    detailFirstPublished: result.detailFirstMetrics.published,
  }
}

function coverageAuditTelemetry(
  result: Awaited<ReturnType<typeof runYstmCoverageAuditCron>>
): Record<string, unknown> {
  const t = result.telemetry
  return {
    ok: result.ok,
    skipped: t.skipped,
    skipReason: t.skipReason,
    listPagesFetched: t.listPagesFetched,
    listingUrlsDiscovered: t.listingUrlsDiscovered,
    detailPagesValidated: t.detailPagesValidated,
    validActiveYstmUrls: t.validActiveYstmUrls,
    publishedVisibleInAudit: t.publishedVisibleInAudit,
    coveragePct: t.coveragePct,
    overlapPrevented: t.overlapPrevented,
  }
}

function classifyYstmSkipped(telemetry: Record<string, unknown>): {
  status: AdminIngestionJobRunStatus
  skipReason?: string
} {
  if (telemetry.skipped === true) {
    const skipReason =
      typeof telemetry.skipReason === 'string' && telemetry.skipReason.trim()
        ? telemetry.skipReason
        : 'skipped'
    return { status: 'skipped', skipReason }
  }
  return { status: 'success' }
}

async function runAdminGeocodeJob(): Promise<AdminIngestionJobRunnerResult> {
  const { envelope: adaptiveEnvelope } = await resolveAdaptiveThroughputForCron()
  const leaseRun = await runWithGeocodePipelineLease({
    logContext: {
      component: 'admin/ingestion/run',
      job: 'geocode',
    },
    execute: () =>
      runGeocodeCronPipeline({
        queueBatchSize: adaptiveEnvelope.geocode.queueBatchSize,
        backlogBatchSize: adaptiveEnvelope.geocode.backlogBatchSize,
        concurrencyCeiling: adaptiveEnvelope.geocode.concurrencyCeiling,
        telemetryContext: {
          jobType: 'admin.ingestion.geocode',
        },
      }),
  })

  if (leaseRun.skipped) {
    return {
      status: 'skipped',
      skipReason: leaseRun.reason ?? 'active_lease',
      telemetry: {
        skipped: true,
        skipReason: leaseRun.reason ?? 'active_lease',
      },
    }
  }

  const { nativeCoord, queue, backlog, replay } = leaseRun.result
  return {
    status: 'success',
    telemetry: {
      skipped: false,
      nativeCoord,
      queue,
      backlog,
      replay,
    },
  }
}

async function runAdminDailyIngestionJob(): Promise<AdminIngestionJobRunnerResult> {
  const laneResolved = await resolveIngestionLaneContext({ mode: 'ingestion', laneParam: null })
  if (!laneResolved.ok) {
    throw new Error(laneResolved.message)
  }

  const opId = generateOperationId()
  const correlation = createCorrelationBundle({ requestId: opId, operationId: opId })
  const withOpId = (context: Record<string, unknown> = {}) => ({
    ...context,
    requestId: correlation.requestId,
    operationId: correlation.operationId,
    correlationId: correlation.correlationId,
  })

  const result = await runIngestionOrchestration(
    withOpId,
    'ingestion',
    {
      requestId: correlation.requestId,
      operationId: correlation.operationId,
      correlationId: correlation.correlationId,
      jobType: 'admin.ingestion.daily_ingestion',
      cronMode: 'ingestion',
    },
    laneResolved.context
  )

  const telemetry = {
    ok: result.ok,
    duration_ms: result.duration_ms,
    lane: result.lane,
    adaptive: result.adaptive,
    steps: result.steps,
  }

  if (!result.ok) {
    const stepError =
      (result.steps?.ingestion as { error?: string } | undefined)?.error ??
      (result.steps?.geocode as { error?: string } | undefined)?.error ??
      (result.steps?.publish as { error?: string } | undefined)?.error
    throw new Error(stepError ?? 'daily_ingestion_failed')
  }

  const ingestionStep = result.steps?.ingestion as
    | { skipped?: boolean; reason?: string; skipReason?: string }
    | undefined
  if (ingestionStep?.skipped === true) {
    const skipReason = ingestionStep.reason ?? ingestionStep.skipReason ?? 'skipped'
    return {
      status: 'skipped',
      skipReason,
      telemetry,
    }
  }

  return {
    status: 'success',
    telemetry,
  }
}

const ADMIN_INGESTION_JOB_RUNNERS: Record<
  AdminIngestionJobKey,
  () => Promise<AdminIngestionJobRunnerResult>
> = {
  missing_ingest: async () => {
    const admin = getAdminDb()
    const result = await runYstmMissingUrlIngestionCron(admin)
    const telemetry = missingIngestTelemetry(result)
    const classified = classifyYstmSkipped(telemetry)
    return { ...classified, telemetry }
  },
  fresh_discovery: async () => {
    const admin = getAdminDb()
    const result = await runYstmFreshDiscoveryCron(admin)
    const telemetry = ystmCronTelemetry(result)
    const classified = classifyYstmSkipped(telemetry)
    return { ...classified, telemetry }
  },
  geocode: runAdminGeocodeJob,
  coverage_audit: async () => {
    const admin = getAdminDb()
    const result = await runYstmCoverageAuditCron(admin)
    const telemetry = coverageAuditTelemetry(result)
    const classified = classifyYstmSkipped(telemetry)
    return { ...classified, telemetry }
  },
  catalog_repair: async () => {
    const admin = getAdminDb()
    const result = await runYstmCatalogRepairCron(admin)
    const telemetry = catalogRepairTelemetry(result)
    const classified = classifyYstmSkipped(telemetry)
    return { ...classified, telemetry }
  },
  shadow_replay: async () => {
    const report = await runAdminShadowReplay()
    return {
      status: 'success',
      telemetry: report as unknown as Record<string, unknown>,
    }
  },
  daily_ingestion: runAdminDailyIngestionJob,
}

export async function runAdminIngestionJob(
  job: AdminIngestionJobKey
): Promise<AdminIngestionJobRunResponse> {
  const startedMs = Date.now()
  const ranAt = new Date().toISOString()

  try {
    const runner = ADMIN_INGESTION_JOB_RUNNERS[job]
    const outcome = await runner()
    return {
      ok: outcome.status !== 'failed',
      job,
      status: outcome.status,
      duration_ms: Date.now() - startedMs,
      ran_at: ranAt,
      telemetry: outcome.telemetry,
      ...(outcome.skipReason ? { skipReason: outcome.skipReason } : {}),
    }
  } catch (err) {
    const { error, stack_top } = formatAdminIngestionJobError(err)
    return {
      ok: false,
      job,
      status: 'failed',
      duration_ms: Date.now() - startedMs,
      ran_at: ranAt,
      error,
      stack_top,
    }
  }
}

export { ADMIN_INGESTION_JOB_RUNNERS }
