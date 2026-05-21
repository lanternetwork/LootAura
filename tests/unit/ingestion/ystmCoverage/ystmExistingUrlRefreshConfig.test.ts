import { describe, expect, it } from 'vitest'
import { parseYstmExistingUrlRefreshBudgets } from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshConfig'

describe('parseYstmExistingUrlRefreshBudgets', () => {
  it('parses env overrides with caps', () => {
    const budgets = parseYstmExistingUrlRefreshBudgets({
      CRON_YSTM_EXISTING_REFRESH_MAX_ATTEMPTS: '99',
      CRON_YSTM_EXISTING_REFRESH_MAX_SCANNED: '999',
    } as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxRefreshesPerRun).toBe(80)
    expect(budgets.maxCandidatesScannedPerRun).toBe(200)
  })

  it('defaults to burn-in existing URL refresh budgets', () => {
    const budgets = parseYstmExistingUrlRefreshBudgets({} as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxRefreshesPerRun).toBe(32)
    expect(budgets.maxCandidatesScannedPerRun).toBe(120)
    expect(budgets.staleSyncHours).toBe(12)
    expect(budgets.maxRuntimeMs).toBe(240_000)
  })
})
