import { describe, expect, it } from 'vitest'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'

describe('normalizeAddressForPublish', () => {
  it('strips trailing USA before publish assembly', () => {
    expect(
      normalizeAddressForPublish('1929 W Montrose Ave, Chicago, IL 60613, USA', 'Chicago', 'IL')
    ).toBe('1929 W Montrose Ave, Chicago, IL 60613')
  })

  it('does not duplicate city state after stripping USA', () => {
    expect(
      normalizeAddressForPublish('123 Main St, Louisville, KY, USA', 'Louisville', 'KY')
    ).toBe('123 Main St, Louisville, KY')
  })
})
