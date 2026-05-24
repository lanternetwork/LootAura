import { describe, expect, it } from 'vitest'
import { parseYstmCoverageAuditBudgets } from '@/lib/ingestion/ystmCoverage/ystmCoverageAuditConfig'

describe('parseYstmCoverageAuditBudgets', () => {
  it('parses env overrides with caps', () => {
    const budgets = parseYstmCoverageAuditBudgets({
      CRON_YSTM_COVERAGE_MAX_CONFIGS: '99',
      CRON_YSTM_COVERAGE_MAX_DETAIL_VALIDATIONS: '999',
    } as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxConfigsPerRun).toBe(40)
    expect(budgets.maxDetailValidationsPerRun).toBe(120)
  })

  it('defaults to production nationwide coverage audit budgets', () => {
    const budgets = parseYstmCoverageAuditBudgets({} as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxConfigsPerRun).toBe(40)
    expect(budgets.maxListFetchesPerRun).toBe(80)
    expect(budgets.maxDetailValidationsPerRun).toBe(120)
    expect(budgets.maxUrlsPerListPage).toBe(200)
    expect(budgets.maxRuntimeMs).toBe(300_000)
  })

  it('uses bootstrap profile when bootstrapEnabled is true', () => {
    const budgets = parseYstmCoverageAuditBudgets({} as unknown as NodeJS.ProcessEnv, true)
    expect(budgets.maxConfigsPerRun).toBe(80)
    expect(budgets.maxDetailValidationsPerRun).toBe(300)
  })
})
