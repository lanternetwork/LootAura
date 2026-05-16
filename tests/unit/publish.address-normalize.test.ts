import { describe, expect, it } from 'vitest'
import { normalizeAddressForPublish } from '@/lib/ingestion/publish'

describe('normalizeAddressForPublish', () => {
  it('leaves full line with city, state, ZIP unchanged', () => {
    expect(normalizeAddressForPublish('620 Lincoln Ave, Winnetka, IL 60093', 'Winnetka', 'IL')).toBe(
      '620 Lincoln Ave, Winnetka, IL 60093'
    )
  })

  it('leaves single city/state suffix unchanged', () => {
    expect(normalizeAddressForPublish('5918 Park Ave, Berkeley, IL', 'Berkeley', 'IL')).toBe(
      '5918 Park Ave, Berkeley, IL'
    )
  })

  it('dedupes repeated trailing city, state', () => {
    expect(
      normalizeAddressForPublish('5918 Park Ave, Berkeley, IL, Berkeley, IL', 'Berkeley', 'IL')
    ).toBe('5918 Park Ave, Berkeley, IL')
  })

  it('appends city/state for street-only', () => {
    expect(normalizeAddressForPublish('225 S Stone Ave', 'La Grange', 'IL')).toBe(
      '225 S Stone Ave, La Grange, IL'
    )
  })

  it('does not duplicate when city/state spacing or case differs', () => {
    expect(normalizeAddressForPublish('5918 Park Ave,  berkeley ,  il', 'Berkeley', 'IL')).toBe(
      '5918 Park Ave, berkeley , il'
    )
  })

  it('matches full state name already in address (USPS param)', () => {
    expect(
      normalizeAddressForPublish('100 Main St, Springfield, Illinois 62701', 'Springfield', 'IL')
    ).toBe('100 Main St, Springfield, Illinois 62701')
  })
})
