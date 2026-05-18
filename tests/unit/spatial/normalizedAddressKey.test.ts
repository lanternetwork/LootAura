import { describe, expect, it } from 'vitest'
import { buildNormalizedAddressKey } from '@/lib/ingestion/spatial/normalizedAddressKey'

describe('buildNormalizedAddressKey', () => {
  it('builds stable lowercase key with city and USPS state', () => {
    expect(
      buildNormalizedAddressKey({
        addressRaw: '4443 S St Louis Ave',
        city: 'Chicago',
        state: 'IL',
      })
    ).toBe('4443 s st louis ave|chicago|IL')
  })

  it('returns null without a full USPS state', () => {
    expect(
      buildNormalizedAddressKey({
        addressRaw: '123 Main',
        city: 'Chicago',
        state: 'Illinois',
      })
    ).toBeNull()
  })
})
