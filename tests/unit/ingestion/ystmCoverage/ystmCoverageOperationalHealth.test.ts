import { describe, expect, it } from 'vitest'
import {
  evaluateYstmCoverageOperationalHealth,
  YSTM_COVERAGE_SLO_MIN_VALID_URLS,
  YSTM_COVERAGE_TARGET_PCT,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageOperationalHealth'

const nowMs = Date.parse('2026-05-20T12:00:00.000Z')

function baseInput(
  overrides: Partial<Parameters<typeof evaluateYstmCoverageOperationalHealth>[0]> = {}
) {
  return {
    targetPct: YSTM_COVERAGE_TARGET_PCT,
    coveragePct: 92,
    validActiveYstmUrls: 100,
    missingValidYstmUrls: 8,
    lastAuditAt: '2026-05-20T06:00:00.000Z',
    trend: [{ coveragePct: 88 }, { coveragePct: 92 }],
    missingIngestionQueue: 8,
    missingIngestionNeverAttempted: 3,
    catalogRepairQueue: 10,
    existingRefreshStale: 20,
    configsWithoutSourcePages: 50,
    crawlableConfigs: 80,
    nowMs,
    ...overrides,
  }
}

describe('evaluateYstmCoverageOperationalHealth', () => {
  it('returns healthy when coverage meets target with sufficient denominator', () => {
    const health = evaluateYstmCoverageOperationalHealth(baseInput())
    expect(health.healthy).toBe(true)
    expect(health.alerts).toHaveLength(0)
  })

  it('warns when audit denominator is too sparse for SLO', () => {
    const health = evaluateYstmCoverageOperationalHealth(
      baseInput({ validActiveYstmUrls: YSTM_COVERAGE_SLO_MIN_VALID_URLS - 1 })
    )
    expect(health.alerts.some((a) => a.code === 'coverage_denominator_sparse')).toBe(true)
  })

  it('fires critical when coverage is below target', () => {
    const health = evaluateYstmCoverageOperationalHealth(
      baseInput({ coveragePct: 72, missingValidYstmUrls: 28 })
    )
    expect(health.healthy).toBe(false)
    expect(health.alerts.some((a) => a.code === 'coverage_below_target')).toBe(true)
  })

  it('warns when coverage trend declines between audits', () => {
    const health = evaluateYstmCoverageOperationalHealth(
      baseInput({
        coveragePct: 80,
        trend: [{ coveragePct: 90 }, { coveragePct: 82 }],
      })
    )
    expect(health.alerts.some((a) => a.code === 'coverage_trend_declining')).toBe(true)
  })

  it('warns when missing queue share is elevated', () => {
    const health = evaluateYstmCoverageOperationalHealth(
      baseInput({ missingValidYstmUrls: 30, coveragePct: 70 })
    )
    expect(health.alerts.some((a) => a.code === 'coverage_missing_queue_elevated')).toBe(true)
  })

  it('warns when last audit is stale', () => {
    const health = evaluateYstmCoverageOperationalHealth(
      baseInput({ lastAuditAt: '2026-05-15T06:00:00.000Z' })
    )
    expect(health.alerts.some((a) => a.code === 'coverage_audit_stale')).toBe(true)
  })
})
