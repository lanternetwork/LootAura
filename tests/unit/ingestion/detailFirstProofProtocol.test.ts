import { describe, expect, it } from 'vitest'
import {
  DETAIL_FIRST_PROOF_INSERT_FAILED_MAX,
  evaluateDetailFirstProofProtocol,
  type EvaluateDetailFirstProofInput,
} from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import {
  DETAIL_FIRST_ADDRESS_VALIDATION_FAILED_WARNING,
  DETAIL_FIRST_SLO_MIN_ATTEMPTS,
  DETAIL_FIRST_SUCCESS_RATE_TARGET,
  type DetailFirstOperationalHealthInput,
} from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

function baseDetailFirst(
  overrides: Partial<DetailFirstOperationalHealthInput> = {}
): DetailFirstOperationalHealthInput {
  return {
    attempted: DETAIL_FIRST_SLO_MIN_ATTEMPTS,
    succeeded: 18,
    published: 12,
    fallback: 2,
    fetchFailed: 0,
    freshInsertReadyAtInsertRate: 0.9,
    medianMsToPublished: 400,
    providerGeocodeBypassRate: 0.92,
    fallbackByReason: { spatial_lookup_failed: 2 },
    topFallbackReason: 'spatial_lookup_failed',
    topFallbackReasonPct: 0.1,
    fallbackUnclassified: 0,
    fallbackReasonAccounted: 2,
    addressFromDetailPage: 18,
    addressFromListSeed: 2,
    addressFromDetailPageRate: 0.9,
    ...overrides,
  }
}

function evaluate(
  overrides: Partial<EvaluateDetailFirstProofInput> = {}
) {
  return evaluateDetailFirstProofProtocol({
    metricsBaselineAt: '2026-05-18T12:00:00.000Z',
    detailFirst: baseDetailFirst(),
    ...overrides,
  })
}

describe('evaluateDetailFirstProofProtocol', () => {
  it('returns pending_baseline when metrics baseline is not set', () => {
    const proof = evaluate({ metricsBaselineAt: null })
    expect(proof.status).toBe('pending_baseline')
    expect(proof.passed).toBe(false)
    expect(proof.checks.find((c) => c.id === 'metrics_baseline_set')?.pass).toBe(false)
  })

  it('returns collecting when baseline is set but sample is below minimum', () => {
    const proof = evaluate({
      detailFirst: baseDetailFirst({
        attempted: DETAIL_FIRST_SLO_MIN_ATTEMPTS - 1,
        providerGeocodeBypassRate: 0.5,
      }),
    })
    expect(proof.status).toBe('collecting')
    expect(proof.passed).toBe(false)
    expect(proof.checks.find((c) => c.id === 'min_attempts')?.pass).toBe(false)
  })

  it('returns pass when all required checks succeed', () => {
    const proof = evaluate()
    expect(proof.status).toBe('pass')
    expect(proof.passed).toBe(true)
    expect(proof.checks.filter((c) => c.required).every((c) => c.pass)).toBe(true)
  })

  it('returns fail when success rate is below target', () => {
    const proof = evaluate({
      detailFirst: baseDetailFirst({
        attempted: 100,
        succeeded: 50,
        providerGeocodeBypassRate: 0.5,
      }),
    })
    expect(proof.status).toBe('fail')
    expect(proof.passed).toBe(false)
    const check = proof.checks.find((c) => c.id === 'success_rate')
    expect(check?.pass).toBe(false)
    expect(check?.threshold).toContain(String(DETAIL_FIRST_SUCCESS_RATE_TARGET * 100))
  })

  it('returns fail when address_validation_failed exceeds threshold', () => {
    const attempted = 100
    const proof = evaluate({
      detailFirst: baseDetailFirst({
        attempted,
        succeeded: 90,
        providerGeocodeBypassRate: 0.9,
        fallbackByReason: {
          address_validation_failed: Math.ceil(
            attempted * DETAIL_FIRST_ADDRESS_VALIDATION_FAILED_WARNING
          ),
        },
        fallback: 10,
        fallbackReasonAccounted: 10,
      }),
    })
    expect(proof.status).toBe('fail')
    expect(
      proof.checks.find((c) => c.id === 'address_validation_failed')?.pass
    ).toBe(false)
  })

  it('returns fail when insert_failed exceeds proof threshold', () => {
    const attempted = 100
    const proof = evaluate({
      detailFirst: baseDetailFirst({
        attempted,
        succeeded: 90,
        providerGeocodeBypassRate: 0.9,
        fallbackByReason: {
          insert_failed: Math.ceil(attempted * DETAIL_FIRST_PROOF_INSERT_FAILED_MAX) + 1,
        },
        fallback: 10,
        fallbackReasonAccounted: 10,
      }),
    })
    expect(proof.status).toBe('fail')
    expect(proof.checks.find((c) => c.id === 'insert_failed')?.pass).toBe(false)
  })

  it('does not require fallback_accounted for pass', () => {
    const proof = evaluate({
      detailFirst: baseDetailFirst({
        fallback: 5,
        fallbackUnclassified: 2,
        fallbackReasonAccounted: 3,
        fallbackByReason: { spatial_lookup_failed: 3, fallback_unclassified: 2 },
      }),
    })
    expect(proof.status).toBe('pass')
    expect(proof.checks.find((c) => c.id === 'fallback_accounted')?.required).toBe(false)
    expect(proof.checks.find((c) => c.id === 'fallback_accounted')?.pass).toBe(false)
  })
})
