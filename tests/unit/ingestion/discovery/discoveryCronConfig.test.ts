import { describe, expect, it } from 'vitest'
import { parseDiscoveryCronBudgets } from '@/lib/ingestion/discovery/discoveryCronConfig'

describe('parseDiscoveryCronBudgets', () => {
  it('parses env overrides with caps', () => {
    const budgets = parseDiscoveryCronBudgets({
      CRON_DISCOVERY_MAX_STATES_PER_RUN: '99',
      CRON_DISCOVERY_MAX_VALIDATION_FETCHES: '999',
    } as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxStatesPerRun).toBe(25)
    expect(budgets.maxValidationFetchesPerRun).toBe(999)
  })

  it('defaults to production nationwide discovery budgets', () => {
    const budgets = parseDiscoveryCronBudgets({} as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxStatesPerRun).toBe(15)
    expect(budgets.maxDiscoveredPagesPerRun).toBe(2000)
    expect(budgets.maxValidationFetchesPerRun).toBe(1000)
    expect(budgets.validationFetchConcurrency).toBe(4)
    expect(budgets.maxRuntimeMs).toBe(300_000)
    expect(budgets.maxPlaceholderRepairConfigsPerRun).toBe(200)
    expect(budgets.maxRevalidationConfigsPerRun).toBe(200)
  })
})
