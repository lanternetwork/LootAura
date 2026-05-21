import { describe, expect, it } from 'vitest'
import { parseDiscoveryCronBudgets } from '@/lib/ingestion/discovery/discoveryCronConfig'

describe('parseDiscoveryCronBudgets', () => {
  it('parses env overrides with caps', () => {
    const budgets = parseDiscoveryCronBudgets({
      CRON_DISCOVERY_MAX_STATES_PER_RUN: '99',
      CRON_DISCOVERY_MAX_VALIDATION_FETCHES: '999',
    } as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxStatesPerRun).toBe(15)
    expect(budgets.maxValidationFetchesPerRun).toBe(200)
  })

  it('defaults to bounded nationwide budgets', () => {
    const budgets = parseDiscoveryCronBudgets({} as unknown as NodeJS.ProcessEnv)
    expect(budgets.maxStatesPerRun).toBe(10)
    expect(budgets.maxDiscoveredPagesPerRun).toBe(200)
    expect(budgets.maxValidationFetchesPerRun).toBe(120)
    expect(budgets.maxRuntimeMs).toBe(240_000)
    expect(budgets.maxPlaceholderRepairConfigsPerRun).toBe(120)
  })
})
