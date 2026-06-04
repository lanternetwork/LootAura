import { describe, expect, it } from 'vitest'
import { formatSaleAddressForPersist } from '@/lib/sales/formatSaleAddressForPersist'

describe('formatSaleAddressForPersist', () => {
  it('formats lowercase street when city and state validate', () => {
    expect(formatSaleAddressForPersist('123 main st', 'Chicago', 'IL')).toBe('123 Main St, Chicago, IL')
  })

  it('returns raw line when locality is missing (cannot validate)', () => {
    expect(formatSaleAddressForPersist('123 main st', '', 'IL')).toBe('123 main st')
    expect(formatSaleAddressForPersist('123 main st', 'Chicago', '')).toBe('123 main st')
  })

  it('returns raw line when publish validation rejects the line', () => {
    expect(formatSaleAddressForPersist('Unknown address', 'Chicago', 'IL')).toBe('Unknown address')
  })

  it('leaves already-formatted addresses stable', () => {
    expect(formatSaleAddressForPersist('123 Main St', 'Chicago', 'IL')).toBe('123 Main St, Chicago, IL')
  })

  it('preserves directionals in the formatted output', () => {
    expect(formatSaleAddressForPersist('100 n main st', 'Chicago', 'IL')).toBe('100 N Main St, Chicago, IL')
  })

  it('strips USA from user-pasted address on persist', () => {
    expect(
      formatSaleAddressForPersist('123 Main St, Louisville, KY, USA', 'Louisville', 'KY')
    ).toBe('123 Main St, Louisville, KY')
  })

  it('strips USA on validation-failure fallback', () => {
    expect(formatSaleAddressForPersist('Louisville, KY, USA', 'Louisville', 'KY')).toBe('Louisville, KY')
  })
})
