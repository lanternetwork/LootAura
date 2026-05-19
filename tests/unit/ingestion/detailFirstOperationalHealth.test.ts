import { describe, expect, it } from 'vitest'
import {
  DETAIL_FIRST_SLO_MIN_ATTEMPTS,
  DETAIL_FIRST_SUCCESS_RATE_WARNING,
  evaluateDetailFirstOperationalHealth,
  type DetailFirstOperationalHealthInput,
} from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

function baseMetrics(
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
    providerGeocodeBypassRate: 0.9,
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

describe('evaluateDetailFirstOperationalHealth', () => {
  it('returns healthy when sample size is below SLO minimum', () => {
    const health = evaluateDetailFirstOperationalHealth(
      baseMetrics({ attempted: DETAIL_FIRST_SLO_MIN_ATTEMPTS - 1, succeeded: 0, providerGeocodeBypassRate: 0 })
    )
    expect(health.healthy).toBe(true)
    expect(health.alerts).toHaveLength(0)
  })

  it('fires critical when success rate is below threshold', () => {
    const health = evaluateDetailFirstOperationalHealth(
      baseMetrics({
        attempted: 100,
        succeeded: 10,
        providerGeocodeBypassRate: 0.1,
      })
    )
    expect(health.healthy).toBe(false)
    expect(health.alerts.some((a) => a.code === 'detail_first_success_rate_low')).toBe(true)
    const lowRateAlert = health.alerts.find((a) => a.code === 'detail_first_success_rate_low')
    expect(lowRateAlert?.message).toContain(`${DETAIL_FIRST_SUCCESS_RATE_WARNING * 100}%`)
  })

  it('fires warning when detail-page address rate is low', () => {
    const health = evaluateDetailFirstOperationalHealth(
      baseMetrics({
        addressFromDetailPage: 2,
        addressFromListSeed: 18,
        addressFromDetailPageRate: 0.1,
      })
    )
    expect(health.alerts.some((a) => a.code === 'detail_first_address_from_list_seed_elevated')).toBe(true)
  })

  it('fires warning when address_validation_failed share is elevated', () => {
    const health = evaluateDetailFirstOperationalHealth(
      baseMetrics({
        fallbackByReason: { address_validation_failed: 5 },
        fallbackUnclassified: 0,
        fallbackReasonAccounted: 5,
        fallback: 5,
      })
    )
    expect(health.alerts.some((a) => a.code === 'detail_first_address_validation_failed_elevated')).toBe(true)
  })

  it('fires fallback_unclassified alert when present', () => {
    const health = evaluateDetailFirstOperationalHealth(
      baseMetrics({
        fallback: 10,
        fallbackUnclassified: 3,
        fallbackReasonAccounted: 7,
        fallbackByReason: { spatial_lookup_failed: 7, fallback_unclassified: 3 },
      })
    )
    expect(health.alerts.some((a) => a.code === 'detail_first_fallback_unclassified')).toBe(true)
  })
})
