import { describe, it, expect } from 'vitest'
import {
  countEstateSalesFromTitles,
  isEstateSaleTitle,
} from '@/lib/admin/social/isEstateSaleTitle'

describe('isEstateSaleTitle', () => {
  it('matches common estate sale title phrases', () => {
    expect(isEstateSaleTitle('Huge Estate Sale in Oak Lawn')).toBe(true)
    expect(isEstateSaleTitle('ESTATE LIQUIDATION - Everything Must Go')).toBe(true)
    expect(isEstateSaleTitle('Living Estate Sale Sat-Sun')).toBe(true)
    expect(isEstateSaleTitle('Whole Home Estate Sale')).toBe(true)
  })

  it('does not match generic yard or garage titles', () => {
    expect(isEstateSaleTitle('Garage Sale')).toBe(false)
    expect(isEstateSaleTitle('Neighborhood Yard Sale')).toBe(false)
    expect(isEstateSaleTitle('Moving Sale')).toBe(false)
    expect(isEstateSaleTitle('123 Main St')).toBe(false)
    expect(isEstateSaleTitle('')).toBe(false)
    expect(isEstateSaleTitle(null)).toBe(false)
  })

  it('counts estate titles in a batch', () => {
    expect(
      countEstateSalesFromTitles([
        'Estate Sale Today',
        'Garage Sale',
        'Living estate sale',
        'Yard Sale',
      ])
    ).toBe(2)
  })
})
