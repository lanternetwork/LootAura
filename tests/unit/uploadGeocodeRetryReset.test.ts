import { describe, it, expect } from 'vitest'
import type { FailureReason } from '@/lib/ingestion/types'
import {
  stripGeocodeFailedFromFailureReasons,
  priorIndicatesTerminalGeocodeFailureForRetryReset,
  shouldResetGeocodeRetryAfterUploadUpdate,
} from '@/lib/ingestion/uploadGeocodeRetryReset'

describe('stripGeocodeFailedFromFailureReasons', () => {
  it('removes geocode_failed and preserves other reasons', () => {
    const input: FailureReason[] = ['geocode_failed', 'missing_address', 'invalid_date']
    expect(stripGeocodeFailedFromFailureReasons(input)).toEqual(['missing_address', 'invalid_date'])
  })

  it('returns unchanged when geocode_failed absent', () => {
    const r: FailureReason[] = ['missing_date', 'invalid_address_format']
    expect(stripGeocodeFailedFromFailureReasons(r)).toEqual(r)
  })
})

describe('priorIndicatesTerminalGeocodeFailureForRetryReset', () => {
  it('is true for needs_check + geocode_failed', () => {
    expect(
      priorIndicatesTerminalGeocodeFailureForRetryReset({
        status: 'needs_check',
        failure_reasons: ['geocode_failed'],
        geocode_attempts: 0,
      })
    ).toBe(true)
  })

  it('is true for needs_check alone', () => {
    expect(
      priorIndicatesTerminalGeocodeFailureForRetryReset({
        status: 'needs_check',
        failure_reasons: ['invalid_date'],
        geocode_attempts: 0,
      })
    ).toBe(true)
  })

  it('is true for geocode_failed with ready status', () => {
    expect(
      priorIndicatesTerminalGeocodeFailureForRetryReset({
        status: 'ready',
        failure_reasons: ['geocode_failed'],
        geocode_attempts: 0,
      })
    ).toBe(true)
  })

  it('is true for geocode_attempts >= 3', () => {
    expect(
      priorIndicatesTerminalGeocodeFailureForRetryReset({
        status: 'needs_geocode',
        failure_reasons: [],
        geocode_attempts: 3,
      })
    ).toBe(true)
  })

  it('is false for needs_geocode with attempts < 3 and no geocode_failed', () => {
    expect(
      priorIndicatesTerminalGeocodeFailureForRetryReset({
        status: 'needs_geocode',
        failure_reasons: [],
        geocode_attempts: 2,
      })
    ).toBe(false)
  })

  it('is true for expired (re-upload after fixing dates)', () => {
    expect(
      priorIndicatesTerminalGeocodeFailureForRetryReset({
        status: 'expired',
        failure_reasons: ['sale_expired'],
        geocode_attempts: 0,
      })
    ).toBe(true)
  })
})

describe('shouldResetGeocodeRetryAfterUploadUpdate', () => {
  it('resets when prior needs_check + geocode_failed and new needs_geocode', () => {
    expect(
      shouldResetGeocodeRetryAfterUploadUpdate({
        newStatus: 'needs_geocode',
        prior: {
          status: 'needs_check',
          failure_reasons: ['geocode_failed'],
          geocode_attempts: 3,
        },
      })
    ).toBe(true)
  })

  it('does not reset when new status is needs_check (invalid_date path)', () => {
    expect(
      shouldResetGeocodeRetryAfterUploadUpdate({
        newStatus: 'needs_check',
        prior: {
          status: 'needs_check',
          failure_reasons: ['geocode_failed', 'invalid_date'],
          geocode_attempts: 3,
        },
      })
    ).toBe(false)
  })

  it('does not reset when already needs_geocode with attempts < 3', () => {
    expect(
      shouldResetGeocodeRetryAfterUploadUpdate({
        newStatus: 'needs_geocode',
        prior: {
          status: 'needs_geocode',
          failure_reasons: [],
          geocode_attempts: 1,
        },
      })
    ).toBe(false)
  })

  it('resets when prior needs_geocode with attempts 3 and new needs_geocode', () => {
    expect(
      shouldResetGeocodeRetryAfterUploadUpdate({
        newStatus: 'needs_geocode',
        prior: {
          status: 'needs_geocode',
          failure_reasons: [],
          geocode_attempts: 3,
        },
      })
    ).toBe(true)
  })

  it('resets when prior expired and new needs_geocode', () => {
    expect(
      shouldResetGeocodeRetryAfterUploadUpdate({
        newStatus: 'needs_geocode',
        prior: {
          status: 'expired',
          failure_reasons: ['sale_expired'],
          geocode_attempts: 0,
        },
      })
    ).toBe(true)
  })
})
