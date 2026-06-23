import { describe, expect, it } from 'vitest'
import {
  failureDetailsSemanticallyEqual,
  stripVolatileFailureDetailTimestamps,
} from '@/lib/ingestion/failureDetailsSemanticEquality'

describe('failureDetailsSemanticEquality', () => {
  it('treats failure_details as equal when only recorded_at differs', () => {
    const prior = {
      address_enrichment: {
        schema_version: 1,
        recorded_at: '2026-06-17T10:00:00.000Z',
        lastReason: 'still_gated',
        attemptCount: 2,
      },
    }
    const next = {
      address_enrichment: {
        schema_version: 1,
        recorded_at: '2026-06-17T12:00:00.000Z',
        lastReason: 'still_gated',
        attemptCount: 2,
      },
    }
    expect(failureDetailsSemanticallyEqual(prior, next)).toBe(true)
  })

  it('detects business field changes such as attemptCount', () => {
    const prior = {
      geocode: {
        recorded_at: '2026-06-17T10:00:00.000Z',
        attemptCount: 1,
        noCoordsReason: 'empty_results',
      },
    }
    const next = {
      geocode: {
        recorded_at: '2026-06-17T12:00:00.000Z',
        attemptCount: 2,
        noCoordsReason: 'empty_results',
      },
    }
    expect(failureDetailsSemanticallyEqual(prior, next)).toBe(false)
  })

  it('ignores archivedAt when comparing terminal archive details', () => {
    const prior = {
      address_enrichment: {
        archivedAt: '2026-06-01T00:00:00.000Z',
        lastReason: 'max_attempts_exceeded',
      },
    }
    const next = {
      address_enrichment: {
        archivedAt: '2026-06-17T00:00:00.000Z',
        lastReason: 'max_attempts_exceeded',
      },
    }
    expect(failureDetailsSemanticallyEqual(prior, next)).toBe(true)
  })

  it('stripVolatileFailureDetailTimestamps removes nested volatile keys', () => {
    expect(
      stripVolatileFailureDetailTimestamps({
        geocode: { recorded_at: 'x', attemptCount: 1 },
        address_enrichment: { archivedAt: 'y', lastReason: 'still_gated' },
      })
    ).toEqual({
      geocode: { attemptCount: 1 },
      address_enrichment: { lastReason: 'still_gated' },
    })
  })
})
