import { describe, expect, it } from 'vitest'
import { displayAddress } from '@/lib/display/address'
import { formatDateOnly } from '@/lib/display/date'

describe('displayAddress', () => {
  it('avoids duplicate city/state when address already includes them with zip', () => {
    expect(displayAddress('123 Main St, Chicago, IL 60601', 'Chicago', 'IL')).toBe(
      '123 Main St, Chicago, IL 60601'
    )
  })

  it('appends city/state for street-only address', () => {
    expect(displayAddress('123 Main St', 'Chicago', 'IL')).toBe('123 Main St, Chicago, IL')
  })

  it('formats lowercase street line when appending city/state', () => {
    expect(displayAddress('123 main st', 'Chicago', 'IL')).toBe('123 Main St, Chicago, IL')
  })

  it('preserves directionals on the street line', () => {
    expect(displayAddress('100 n oak ave', 'Chicago', 'IL')).toBe('100 N Oak Ave, Chicago, IL')
  })

  it('keeps already formatted multi-segment lines stable', () => {
    expect(displayAddress('123 Main St, Chicago, IL', 'Chicago', 'IL')).toBe('123 Main St, Chicago, IL')
  })

  it('documents mixed-case token handling from shared formatter', () => {
    // formatStreetSegment title-cases unknown tokens (same as persist formatter)
    expect(displayAddress('10 McDonald Rd', 'Chicago', 'IL')).toBe('10 Mcdonald Rd, Chicago, IL')
  })
})


describe('formatDateOnly', () => {
  it('formats YYYY-MM-DD without local timezone day rollback', () => {
    expect(formatDateOnly('2026-05-08', { month: 'short', day: 'numeric', year: 'numeric' })).toBe(
      'May 8, 2026'
    )
  })
})

