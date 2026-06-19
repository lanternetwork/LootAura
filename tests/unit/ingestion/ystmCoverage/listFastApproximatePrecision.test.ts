import { describe, expect, it } from 'vitest'
import { isCoordinatePrecisionPublishable } from '@/lib/geocode/geocodePrecisionPolicy'

describe('approximate coordinate precision publish policy', () => {
  it('treats approximate as publishable for list-fast path', () => {
    expect(isCoordinatePrecisionPublishable('approximate')).toBe(true)
  })
})
