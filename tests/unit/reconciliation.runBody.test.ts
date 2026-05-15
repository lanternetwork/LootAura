import { describe, expect, it } from 'vitest'
import { MAX_RECONCILIATION_RUN_LIMIT, parseReconciliationRunBody } from '@/lib/reconciliation/reconciliationRunBody'

describe('parseReconciliationRunBody', () => {
  it('defaults dryRun to true when omitted', () => {
    expect(parseReconciliationRunBody({}).dryRun).toBe(true)
    expect(parseReconciliationRunBody({ limit: 10 }).dryRun).toBe(true)
  })

  it('sets dryRun false only when explicitly false', () => {
    expect(parseReconciliationRunBody({ dryRun: false }).dryRun).toBe(false)
    expect(parseReconciliationRunBody({ dryRun: true }).dryRun).toBe(true)
  })

  it('caps limit at MAX_RECONCILIATION_RUN_LIMIT', () => {
    expect(parseReconciliationRunBody({ limit: 999 }).limit).toBe(MAX_RECONCILIATION_RUN_LIMIT)
    expect(parseReconciliationRunBody({ limit: MAX_RECONCILIATION_RUN_LIMIT + 1 }).limit).toBe(MAX_RECONCILIATION_RUN_LIMIT)
  })

  it('parses sourcePlatform and onlyPlaceholder', () => {
    const p = parseReconciliationRunBody({
      sourcePlatform: ' external_page_source ',
      onlyPlaceholder: true,
    })
    expect(p.sourcePlatform).toBe('external_page_source')
    expect(p.onlyPlaceholder).toBe(true)
  })

  it('defaults applySafeSync to false unless explicitly true', () => {
    expect(parseReconciliationRunBody({}).applySafeSync).toBe(false)
    expect(parseReconciliationRunBody({ applySafeSync: false }).applySafeSync).toBe(false)
    expect(parseReconciliationRunBody({ applySafeSync: true }).applySafeSync).toBe(true)
  })

  it('defaults limit to 25 when invalid', () => {
    expect(parseReconciliationRunBody({ limit: 'x' }).limit).toBe(25)
    expect(parseReconciliationRunBody({ limit: 0 }).limit).toBe(25)
  })
})
