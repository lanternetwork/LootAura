import { describe, expect, it } from 'vitest'
import {
  isNativeCoordNeedsCheckEligible,
  isPublishableAddressForNativeRemediation,
  isYstmNativeRemediationCandidate,
  ystmRowAwaitingNativeRemediation,
} from '@/lib/ingestion/spatial/nativeCoordEligibility'

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'

describe('isNativeCoordNeedsCheckEligible', () => {
  it('allows transient_provider retryable dead-letter only', () => {
    expect(
      isNativeCoordNeedsCheckEligible({
        geocode_dead_letter: {
          disposition: 'retryable',
          eligible_replay: true,
          reasons: ['transient_provider'],
        },
      })
    ).toBe(true)
  })

  it('rejects permanent terminal and non-transient needs_check', () => {
    expect(
      isNativeCoordNeedsCheckEligible({
        geocode_dead_letter: {
          disposition: 'permanent_terminal',
          eligible_replay: true,
          reasons: ['transient_provider'],
        },
      })
    ).toBe(false)
    expect(
      isNativeCoordNeedsCheckEligible({
        geocode_dead_letter: {
          disposition: 'retryable',
          eligible_replay: true,
          reasons: ['missing_address_input'],
        },
      })
    ).toBe(false)
  })
})

describe('isYstmNativeRemediationCandidate', () => {
  it('accepts needs_geocode YSTM rows with address_available', () => {
    expect(
      isYstmNativeRemediationCandidate({
        sourcePlatform: 'external_page_source',
        sourceUrl: DETAIL_URL,
        status: 'needs_geocode',
        lat: null,
        lng: null,
        addressStatus: 'address_available',
        publishedSaleId: null,
      })
    ).toBe(true)
  })

  it('rejects address_gated and rows with coordinates', () => {
    expect(
      isYstmNativeRemediationCandidate({
        sourcePlatform: 'external_page_source',
        sourceUrl: DETAIL_URL,
        status: 'needs_geocode',
        lat: 41.0,
        lng: -87.0,
        addressStatus: 'address_available',
        publishedSaleId: null,
      })
    ).toBe(false)
    expect(
      isYstmNativeRemediationCandidate({
        sourcePlatform: 'external_page_source',
        sourceUrl: DETAIL_URL,
        status: 'needs_geocode',
        lat: null,
        lng: null,
        addressStatus: 'address_gated',
        publishedSaleId: null,
      })
    ).toBe(false)
  })
})

describe('ystmRowAwaitingNativeRemediation (geocode guard)', () => {
  it('blocks geocode while native path is active', () => {
    expect(
      ystmRowAwaitingNativeRemediation({
        sourcePlatform: 'external_page_source',
        sourceUrl: DETAIL_URL,
        lat: null,
        lng: null,
        nativeCoordAttempts: 0,
        nativeCoordFailureReason: null,
      })
    ).toBe(true)
  })

  it('releases geocode after terminal native failure or max attempts', () => {
    expect(
      ystmRowAwaitingNativeRemediation({
        sourcePlatform: 'external_page_source',
        sourceUrl: DETAIL_URL,
        lat: null,
        lng: null,
        nativeCoordAttempts: 2,
        nativeCoordFailureReason: 'terminal_no_coords',
      })
    ).toBe(false)
    expect(
      ystmRowAwaitingNativeRemediation({
        sourcePlatform: 'external_page_source',
        sourceUrl: DETAIL_URL,
        lat: null,
        lng: null,
        nativeCoordAttempts: 5,
        nativeCoordFailureReason: null,
      })
    ).toBe(false)
  })
})

describe('isPublishableAddressForNativeRemediation', () => {
  it('rejects placeholder addresses', () => {
    expect(isPublishableAddressForNativeRemediation('TBD', 'Chicago', 'IL')).toBe(false)
  })
})
