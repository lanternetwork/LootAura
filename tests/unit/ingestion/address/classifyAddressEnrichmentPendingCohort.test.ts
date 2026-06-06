import { describe, expect, it } from 'vitest'
import {
  classifyAddressEnrichmentPendingCohortRow,
  evaluateAddressEnrichmentClaimEligibility,
  mapAddressEnrichmentFailureSubtype,
} from '@/lib/ingestion/address/classifyAddressEnrichmentPendingCohort'
import { MAX_ADDRESS_ENRICHMENT_ATTEMPTS } from '@/lib/ingestion/address/addressLifecycleTypes'

const nowMs = Date.parse('2026-06-06T12:00:00.000Z')

function baseRow() {
  return {
    id: 'row-1',
    addressStatus: 'address_enrichment_pending',
    coordinatePrecision: 'provider_native',
    status: 'needs_check',
    addressEnrichmentAttempts: 2,
    nextEnrichmentAttemptAt: null,
    addressUnlockAt: null,
    lastAddressEnrichmentAttemptAt: '2026-06-06T11:30:00.000Z',
    addressEnrichmentFailureReason: 'parse_no_address',
    failureDetails: { address_enrichment: { lastReason: 'parse_no_address', attemptCount: 2 } },
  }
}

describe('classifyAddressEnrichmentPendingCohort', () => {
  it('marks exhausted when attempts reach ceiling', () => {
    expect(
      classifyAddressEnrichmentPendingCohortRow(
        { ...baseRow(), addressEnrichmentAttempts: MAX_ADDRESS_ENRICHMENT_ATTEMPTS },
        nowMs
      )
    ).toBe('exhausted')
  })

  it('marks waiting when next attempt is scheduled in the future', () => {
    expect(
      classifyAddressEnrichmentPendingCohortRow(
        {
          ...baseRow(),
          nextEnrichmentAttemptAt: '2026-06-06T13:00:00.000Z',
        },
        nowMs
      )
    ).toBe('waiting')
  })

  it('marks stalled when claimable after prior attempts', () => {
    expect(classifyAddressEnrichmentPendingCohortRow(baseRow(), nowMs)).toBe('stalled')
  })

  it('marks eligible_now when never attempted and claimable', () => {
    expect(
      classifyAddressEnrichmentPendingCohortRow(
        {
          ...baseRow(),
          addressEnrichmentAttempts: 0,
          addressEnrichmentFailureReason: null,
          failureDetails: null,
          lastAddressEnrichmentAttemptAt: null,
        },
        nowMs
      )
    ).toBe('eligible_now')
  })

  it('maps parse_no_address failure subtype', () => {
    expect(
      mapAddressEnrichmentFailureSubtype({
        addressEnrichmentFailureReason: 'parse_no_address',
        failureDetails: null,
        addressEnrichmentAttempts: 2,
        claimable: true,
      })
    ).toBe('parse_no_address')
  })

  it('evaluates cooldown as not claimable', () => {
    const eligibility = evaluateAddressEnrichmentClaimEligibility(
      {
        ...baseRow(),
        lastAddressEnrichmentAttemptAt: '2026-06-06T11:50:00.000Z',
      },
      nowMs
    )
    expect(eligibility.claimable).toBe(false)
    expect(eligibility.skipReason).toBe('cooldown_active')
  })
})
