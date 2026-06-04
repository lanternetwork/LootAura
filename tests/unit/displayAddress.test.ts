import { describe, expect, it } from 'vitest'
import { displayAddress } from '@/lib/display/address'

describe('displayAddress', () => {
  it('strips trailing USA from legacy sales.address values', () => {
    expect(
      displayAddress('1929 W Montrose Ave, Chicago, IL 60613, USA', 'Chicago', 'IL')
    ).toBe('1929 W Montrose Ave, Chicago, IL 60613')
  })

  it('strips USA before appending city and state when missing from base', () => {
    expect(displayAddress('123 Main St, USA', 'Louisville', 'KY')).toBe('123 Main St, Louisville, KY')
  })

  it('formats city and state when address is empty', () => {
    expect(displayAddress(null, 'Chicago', 'IL')).toBe('Chicago, IL')
  })
})
