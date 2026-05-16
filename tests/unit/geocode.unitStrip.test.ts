import { describe, it, expect } from 'vitest'
import {
  addressLineHasUnitDesignatorForGeocode,
  stripUnitDesignatorFromAddressLineForGeocode,
} from '@/lib/geocode/stripUnitDesignatorForGeocode'

describe('stripUnitDesignatorFromAddressLineForGeocode', () => {
  it('strips Unit A from first segment; preserves trailing city/state segments', () => {
    expect(
      stripUnitDesignatorFromAddressLineForGeocode('11020 Front St Unit A, Mokena, IL')
    ).toBe('11020 Front St, Mokena, IL')
  })

  it('strips Apt variant', () => {
    expect(stripUnitDesignatorFromAddressLineForGeocode('10 Oak Apt 5B, Chicago, IL')).toBe('10 Oak, Chicago, IL')
  })

  it('strips Apartment variant', () => {
    expect(stripUnitDesignatorFromAddressLineForGeocode('1 Main Apartment 12, X, Y')).toBe('1 Main, X, Y')
  })

  it('strips Suite variant', () => {
    expect(stripUnitDesignatorFromAddressLineForGeocode('9 Elm Suite 300, A, B')).toBe('9 Elm, A, B')
  })

  it('strips Ste variant', () => {
    expect(stripUnitDesignatorFromAddressLineForGeocode('2 Pine Ste 4, A, B')).toBe('2 Pine, A, B')
  })

  it('strips # unit variant', () => {
    expect(stripUnitDesignatorFromAddressLineForGeocode('5 Lake St # 2C, A, B')).toBe('5 Lake St, A, B')
  })

  it('returns null when no designator on first segment', () => {
    expect(stripUnitDesignatorFromAddressLineForGeocode('606 W Something St, Chicago, IL')).toBeNull()
  })

  it('does not strip from second comma segment (malformed trailing numerics stay)', () => {
    expect(
      stripUnitDesignatorFromAddressLineForGeocode('99 Main St, Chicago, IL, 90210')
    ).toBeNull()
  })

  it('addressLineHasUnitDesignatorForGeocode matches first segment only', () => {
    expect(addressLineHasUnitDesignatorForGeocode('11020 Front St Unit A, Mokena, IL')).toBe(true)
    expect(addressLineHasUnitDesignatorForGeocode('606 W Something, Chicago, IL')).toBe(false)
  })
})
