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
})

describe('formatDateOnly', () => {
  it('formats YYYY-MM-DD without local timezone day rollback', () => {
    expect(formatDateOnly('2026-05-08', { month: 'short', day: 'numeric', year: 'numeric' })).toBe(
      'May 8, 2026'
    )
  })
})

