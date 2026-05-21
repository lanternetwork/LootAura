import { describe, expect, it } from 'vitest'
import { isEligibleForMissingIngestionRetry } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingCandidates'

describe('isEligibleForMissingIngestionRetry', () => {
  const nowMs = Date.parse('2026-05-18T12:00:00.000Z')

  it('allows first attempt when outcome is null', () => {
    expect(
      isEligibleForMissingIngestionRetry(
        { missingIngestionOutcome: null, missingIngestionAttemptedAt: null },
        nowMs,
        6
      )
    ).toBe(true)
  })

  it('blocks non-failed terminal outcomes', () => {
    expect(
      isEligibleForMissingIngestionRetry(
        {
          missingIngestionOutcome: 'published',
          missingIngestionAttemptedAt: '2026-05-18T10:00:00.000Z',
        },
        nowMs,
        6
      )
    ).toBe(false)
  })

  it('retries failed outcomes after cooldown', () => {
    expect(
      isEligibleForMissingIngestionRetry(
        {
          missingIngestionOutcome: 'failed',
          missingIngestionAttemptedAt: '2026-05-18T04:00:00.000Z',
        },
        nowMs,
        6
      )
    ).toBe(true)
    expect(
      isEligibleForMissingIngestionRetry(
        {
          missingIngestionOutcome: 'failed',
          missingIngestionAttemptedAt: '2026-05-18T10:00:00.000Z',
        },
        nowMs,
        6
      )
    ).toBe(false)
  })
})
