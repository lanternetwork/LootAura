import { describe, expect, it } from 'vitest'
import { evaluateEsnetCoverageBootstrapExitCriteria } from '@/lib/ingestion/estatesalesnet/esnetCoverageBootstrapExit'

describe('evaluateEsnetCoverageBootstrapExitCriteria', () => {
  it('requires minimum crawlable configs and burn-in hours', () => {
    const fail = evaluateEsnetCoverageBootstrapExitCriteria({
      crawlableConfigCount: 2,
      fetchFailureRate24h: 0,
      enabledAt: new Date().toISOString(),
      nowMs: Date.now(),
    })
    expect(fail.met).toBe(false)

    const pass = evaluateEsnetCoverageBootstrapExitCriteria({
      crawlableConfigCount: 10,
      fetchFailureRate24h: 0,
      enabledAt: new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(),
      nowMs: Date.now(),
    })
    expect(pass.met).toBe(true)
  })
})
