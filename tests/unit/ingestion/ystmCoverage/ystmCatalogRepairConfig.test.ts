import { describe, expect, it } from 'vitest'
import { parseYstmCatalogRepairBudgets } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairConfig'

describe('parseYstmCatalogRepairBudgets', () => {
  it('parses env overrides with caps', () => {
    const budgets = parseYstmCatalogRepairBudgets({
      CRON_YSTM_CATALOG_REPAIR_MAX_ATTEMPTS: '999',
      CRON_YSTM_CATALOG_REPAIR_MAX_SCANNED: '999',
    } as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxRepairsPerRun).toBe(100)
    expect(budgets.maxCandidatesScannedPerRun).toBe(250)
  })

  it('defaults to production nationwide catalog repair budgets', () => {
    const budgets = parseYstmCatalogRepairBudgets({} as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxRepairsPerRun).toBe(100)
    expect(budgets.maxCandidatesScannedPerRun).toBe(250)
    expect(budgets.failedRetryHours).toBe(6)
    expect(budgets.maxRuntimeMs).toBe(300_000)
  })
})
