import { fetchCoverageBootstrapEnabled } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import { parseYstmCatalogRepairBudgets } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairConfig'
import { parseYstmCoverageMissingIngestionBudgets } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingIngestionConfig'
import { runYstmCatalogRepairCron } from '@/lib/ingestion/ystmCoverage/runYstmCatalogRepairCron'
import { runYstmMissingUrlIngestionCron } from '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
import { aggregateYstmCatalogRepair } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairMetrics'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type PostAuditCoverageReconcileTelemetry = {
  ran: boolean
  missingIngest: {
    skipped: boolean
    skipReason: string | null
    published: number
    failed: number
    detailFirstAttempts: number
  } | null
  catalogRepair: {
    skipped: boolean
    skipReason: string | null
    published: number
    repairAttempts: number
  } | null
}

export async function runPostAuditCoverageReconcile(
  admin: ReturnType<typeof getAdminDb>,
  options?: { bootstrapEnabled?: boolean; nowMs?: number }
): Promise<PostAuditCoverageReconcileTelemetry> {
  const bootstrapEnabled =
    options?.bootstrapEnabled ?? (await fetchCoverageBootstrapEnabled(admin))

  if (!bootstrapEnabled) {
    return { ran: false, missingIngest: null, catalogRepair: null }
  }

  const logContext = { component: 'ingestion/ystmCoverage/runPostAuditCoverageReconcile' }
  const missingBudgets = parseYstmCoverageMissingIngestionBudgets(process.env, true)
  const repairBudgets = parseYstmCatalogRepairBudgets(process.env, true)

  let missingResult: PostAuditCoverageReconcileTelemetry['missingIngest'] = null
  let repairResult: PostAuditCoverageReconcileTelemetry['catalogRepair'] = null

  try {
    const missing = await runYstmMissingUrlIngestionCron(admin, { budgets: missingBudgets })
    missingResult = {
      skipped: missing.telemetry.skipped,
      skipReason: missing.telemetry.skipReason,
      published: missing.telemetry.published,
      failed: missing.telemetry.failed,
      detailFirstAttempts: missing.telemetry.detailFirstAttempts,
    }
  } catch (err) {
    logger.warn('Post-audit missing-ingest failed', {
      ...logContext,
      message: err instanceof Error ? err.message : String(err),
    })
    missingResult = {
      skipped: true,
      skipReason: 'error',
      published: 0,
      failed: 0,
      detailFirstAttempts: 0,
    }
  }

  try {
    const repairAgg = await aggregateYstmCatalogRepair(admin, options?.nowMs ?? Date.now())
    if (repairAgg.repairQueueTotal > 0) {
      const repair = await runYstmCatalogRepairCron(admin, { budgets: repairBudgets })
      repairResult = {
        skipped: repair.telemetry.skipped,
        skipReason: repair.telemetry.skipReason,
        published: repair.telemetry.published,
        repairAttempts: repair.telemetry.repairAttempts,
      }
    } else {
      repairResult = {
        skipped: true,
        skipReason: 'empty_repair_queue',
        published: 0,
        repairAttempts: 0,
      }
    }
  } catch (err) {
    logger.warn('Post-audit catalog-repair failed', {
      ...logContext,
      message: err instanceof Error ? err.message : String(err),
    })
    repairResult = {
      skipped: true,
      skipReason: 'error',
      published: 0,
      repairAttempts: 0,
    }
  }

  return { ran: true, missingIngest: missingResult, catalogRepair: repairResult }
}
