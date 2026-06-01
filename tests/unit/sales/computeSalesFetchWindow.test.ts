import { describe, it, expect } from 'vitest'
import {
  SALES_FETCH_WINDOW_MAX,
  computeSalesFetchWindow,
  isFetchWindowCapped,
} from '@/lib/sales/computeSalesFetchWindow'

describe('computeSalesFetchWindow', () => {
  it('matches marketplace map fetch (client limit=200, offset=0)', () => {
    expect(computeSalesFetchWindow(0, 200)).toBe(1000)
    expect(isFetchWindowCapped(0, 200)).toBe(true)
  })

  it('uses minimum floor of 200 for small limits', () => {
    expect(computeSalesFetchWindow(0, 24)).toBe(200)
    expect(isFetchWindowCapped(0, 24)).toBe(false)
  })

  it('caps at 1000 regardless of larger limit*multiplier', () => {
    expect(computeSalesFetchWindow(0, 200)).toBe(SALES_FETCH_WINDOW_MAX)
    expect(computeSalesFetchWindow(100, 200)).toBe(SALES_FETCH_WINDOW_MAX)
  })

  it('scales with offset before hitting cap', () => {
    expect(computeSalesFetchWindow(0, 100)).toBe(500)
    expect(isFetchWindowCapped(0, 100)).toBe(false)
  })
})
