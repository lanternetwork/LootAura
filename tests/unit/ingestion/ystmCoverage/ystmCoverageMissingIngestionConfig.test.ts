import { describe, expect, it } from 'vitest'
import { parseYstmCoverageMissingIngestionBudgets } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingIngestionConfig'

describe('parseYstmCoverageMissingIngestionBudgets', () => {
  it('parses env overrides with caps', () => {
    const budgets = parseYstmCoverageMissingIngestionBudgets({
      CRON_YSTM_MISSING_INGEST_MAX_ATTEMPTS: '99',
      CRON_YSTM_MISSING_INGEST_MAX_SCANNED: '999',
    } as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxAttemptsPerRun).toBe(60)
    expect(budgets.maxCandidatesScannedPerRun).toBe(200)
  })

  it('defaults to burn-in missing-ingest budgets', () => {
    const budgets = parseYstmCoverageMissingIngestionBudgets({} as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxAttemptsPerRun).toBe(48)
    expect(budgets.maxCandidatesScannedPerRun).toBe(160)
    expect(budgets.failedRetryHours).toBe(6)
    expect(budgets.maxRuntimeMs).toBe(240_000)
  })
})
