import { describe, expect, it } from 'vitest'
import {
  evaluateCoverageBootstrapExitCriteria,
  evaluateCoverageBootstrapFetchPressureDisable,
  isCoverageBootstrapSchemaUnavailable,
} from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'

describe('coverageBootstrapNationwideMode', () => {
  it('requires all exit criteria including 24h minimum enabled time', () => {
    const nowMs = Date.parse('2026-05-25T12:00:00.000Z')
    const evaluation = evaluateCoverageBootstrapExitCriteria({
      coveragePct: 91,
      missingValidYstmUrls: 10,
      validActiveYstmUrls: 3500,
      catalogRepairQueue: 20,
      fetchFailureRate24h: 0,
      blockRate24h: 0,
      enabledAt: '2026-05-24T11:00:00.000Z',
      nowMs,
    })
    expect(evaluation.met).toBe(true)
    expect(evaluation.reasons).toHaveLength(0)
  })

  it('fails exit when bootstrap enabled less than 24 hours', () => {
    const nowMs = Date.parse('2026-05-24T20:00:00.000Z')
    const evaluation = evaluateCoverageBootstrapExitCriteria({
      coveragePct: 95,
      missingValidYstmUrls: 0,
      validActiveYstmUrls: 5000,
      catalogRepairQueue: 0,
      fetchFailureRate24h: 0,
      blockRate24h: 0,
      enabledAt: '2026-05-24T11:00:00.000Z',
      nowMs,
    })
    expect(evaluation.met).toBe(false)
    expect(evaluation.reasons.some((r) => r.includes('24h'))).toBe(true)
  })

  it('flags fetch pressure above 5%', () => {
    expect(evaluateCoverageBootstrapFetchPressureDisable(5.1)).toBe(true)
    expect(evaluateCoverageBootstrapFetchPressureDisable(5)).toBe(false)
  })

  it('detects missing bootstrap columns from PostgREST errors', () => {
    expect(
      isCoverageBootstrapSchemaUnavailable({
        code: 'PGRST204',
        message: "Could not find the 'coverage_bootstrap_enabled' column",
      })
    ).toBe(true)
    expect(
      isCoverageBootstrapSchemaUnavailable({
        code: '42703',
        message: 'column coverage_bootstrap_enabled does not exist',
      })
    ).toBe(true)
    expect(
      isCoverageBootstrapSchemaUnavailable({
        code: 'PGRST204',
        message: 'Could not find the moderation_status column',
      })
    ).toBe(false)
  })
})
