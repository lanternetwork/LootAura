import { describe, expect, it } from 'vitest'
import {
  classifyNeedsCheckBlocker,
  blockerCategoryToRepairOwner,
  hasGeocodeDeadLetter,
} from '@/lib/admin/classifyNeedsCheckBlocker'

const base = {
  coordinatePrecision: 'exact_address',
  failureDetails: null,
  failureReasons: [],
  lat: 34.05,
  lng: -118.25,
  normalizedAddress: '123 Main St',
  city: 'Los Angeles',
  state: 'CA',
  dateStart: '2026-06-10',
  dateEnd: '2026-06-12',
  nowMs: Date.parse('2026-06-05T12:00:00.000Z'),
}

describe('classifyNeedsCheckBlocker', () => {
  it('classifies geocode dead-letter before address gates', () => {
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_gated',
        failureDetails: { geocode_dead_letter: { disposition: 'retryable' } },
      })
    ).toBe('geocode_blocked')
  })

  it('classifies address_gated', () => {
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_gated',
        lat: null,
        lng: null,
      })
    ).toBe('address_gated')
  })

  it('classifies address enrichment retryable statuses', () => {
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_enrichment_pending',
        lat: null,
        lng: null,
      })
    ).toBe('address_enrichment_retryable')
  })

  it('classifies address enrichment terminal separately from retryable', () => {
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_unavailable_terminal',
        lat: null,
        lng: null,
      })
    ).toBe('address_enrichment_terminal')
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_terminal_active',
        lat: null,
        lng: null,
      })
    ).toBe('address_enrichment_terminal')
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_terminal_archived',
        lat: null,
        lng: null,
      })
    ).toBe('address_enrichment_terminal')
  })

  it('classifies precision gated for locality', () => {
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_available',
        coordinatePrecision: 'locality',
      })
    ).toBe('precision_gated')
  })

  it('classifies publish eligible when gates pass', () => {
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_available',
      })
    ).toBe('publish_eligible_today')
  })

  it('falls through to other when address unavailable without enrichment status', () => {
    expect(
      classifyNeedsCheckBlocker({
        ...base,
        addressStatus: 'address_available',
        lat: null,
        lng: null,
        normalizedAddress: null,
      })
    ).toBe('other')
  })

  it('maps categories to repair owners', () => {
    expect(blockerCategoryToRepairOwner('address_gated')).toBe('address_enrichment')
    expect(blockerCategoryToRepairOwner('address_enrichment_retryable')).toBe('address_enrichment')
    expect(blockerCategoryToRepairOwner('address_enrichment_terminal')).toBe('other')
    expect(blockerCategoryToRepairOwner('precision_gated')).toBe('precision_handling')
    expect(blockerCategoryToRepairOwner('geocode_blocked')).toBe('geocoding')
    expect(blockerCategoryToRepairOwner('publish_eligible_today')).toBe('catalog_repair')
  })

  it('detects geocode dead letter section', () => {
    expect(hasGeocodeDeadLetter({ geocode_dead_letter: { disposition: 'permanent_terminal' } })).toBe(
      true
    )
    expect(hasGeocodeDeadLetter({ address_enrichment: {} })).toBe(false)
  })
})
