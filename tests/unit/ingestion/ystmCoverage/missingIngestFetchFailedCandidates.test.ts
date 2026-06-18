import { describe, expect, it } from 'vitest'

import {
  isEligibleForFetchFailedReplayInterval,
  isMissingIngestFetchFailedRetryableRow,
} from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedCandidates'

const NOW_MS = Date.parse('2026-06-17T12:00:00.000Z')

describe('isEligibleForFetchFailedReplayInterval', () => {
  it('allows first replay when last retry is null', () => {
    expect(isEligibleForFetchFailedReplayInterval(null, NOW_MS)).toBe(true)
  })

  it('blocks replay inside 24h cooldown', () => {
    const lastRetry = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString()
    expect(isEligibleForFetchFailedReplayInterval(lastRetry, NOW_MS)).toBe(false)
  })

  it('allows replay after 24h cooldown', () => {
    const lastRetry = new Date(NOW_MS - 25 * 60 * 60 * 1000).toISOString()
    expect(isEligibleForFetchFailedReplayInterval(lastRetry, NOW_MS)).toBe(true)
  })
})

describe('isMissingIngestFetchFailedRetryableRow', () => {
  const base = {
    ystm_valid_active: true,
    lootaura_visible: false,
    missing_ingestion_outcome: 'failed' as const,
    missing_ingestion_failure_reason: 'fetch_failed' as const,
    missing_ingestion_replay_count: 0,
    wouldPublish: true,
    hasPrimaryIngestedRow: false,
  }

  it('accepts fetch_failed cohort row', () => {
    expect(isMissingIngestFetchFailedRetryableRow(base)).toBe(true)
  })

  it('rejects terminal and ingested rows', () => {
    expect(
      isMissingIngestFetchFailedRetryableRow({
        ...base,
        missing_ingestion_outcome: 'terminal',
      })
    ).toBe(false)
    expect(
      isMissingIngestFetchFailedRetryableRow({
        ...base,
        hasPrimaryIngestedRow: true,
      })
    ).toBe(false)
    expect(
      isMissingIngestFetchFailedRetryableRow({
        ...base,
        wouldPublish: false,
      })
    ).toBe(false)
    expect(
      isMissingIngestFetchFailedRetryableRow({
        ...base,
        missing_ingestion_replay_count: 3,
      })
    ).toBe(false)
  })
})
