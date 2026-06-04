import { describe, expect, it } from 'vitest'
import { stripTrailingUsCountryFromAddressLine } from '@/lib/display/stripTrailingUsCountry'

describe('stripTrailingUsCountryFromAddressLine', () => {
  it('strips trailing USA', () => {
    expect(
      stripTrailingUsCountryFromAddressLine('1929 W Montrose Ave, Chicago, IL 60613, USA')
    ).toBe('1929 W Montrose Ave, Chicago, IL 60613')
  })

  it('strips trailing United States variants', () => {
    expect(
      stripTrailingUsCountryFromAddressLine('123 Main St, Louisville, KY, United States')
    ).toBe('123 Main St, Louisville, KY')
    expect(
      stripTrailingUsCountryFromAddressLine('123 Main St, Louisville, KY, United States of America')
    ).toBe('123 Main St, Louisville, KY')
    expect(stripTrailingUsCountryFromAddressLine('123 Main St, Louisville, KY, U.S.A.')).toBe(
      '123 Main St, Louisville, KY'
    )
    expect(stripTrailingUsCountryFromAddressLine('123 Main St, Louisville, KY, U.S.')).toBe(
      '123 Main St, Louisville, KY'
    )
  })

  it('strips country without ZIP before suffix', () => {
    expect(stripTrailingUsCountryFromAddressLine('Chicago, IL, USA')).toBe('Chicago, IL')
    expect(stripTrailingUsCountryFromAddressLine('123 Main St, Louisville, KY, USA')).toBe(
      '123 Main St, Louisville, KY'
    )
  })

  it('is case-insensitive on country token', () => {
    expect(
      stripTrailingUsCountryFromAddressLine('1929 W Montrose Ave, Chicago, IL 60613, usa')
    ).toBe('1929 W Montrose Ave, Chicago, IL 60613')
  })

  it('does not strip USA embedded in street or city segments', () => {
    expect(stripTrailingUsCountryFromAddressLine('USA Storage, Louisville, KY')).toBe(
      'USA Storage, Louisville, KY'
    )
    expect(
      stripTrailingUsCountryFromAddressLine('123 United States Highway 19, FL')
    ).toBe('123 United States Highway 19, FL')
    expect(stripTrailingUsCountryFromAddressLine('USA Auto Sales, Chicago, IL')).toBe(
      'USA Auto Sales, Chicago, IL'
    )
  })

  it('leaves lines without country suffix unchanged', () => {
    expect(stripTrailingUsCountryFromAddressLine('620 Lincoln Ave, Winnetka, IL 60093')).toBe(
      '620 Lincoln Ave, Winnetka, IL 60093'
    )
  })
})
