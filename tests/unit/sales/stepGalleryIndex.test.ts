import { describe, expect, it } from 'vitest'
import { stepGalleryIndex } from '@/components/sales/SaleDetailFullscreenGallery'

describe('stepGalleryIndex', () => {
  it('wraps next at end', () => {
    expect(stepGalleryIndex(2, 3, 'next')).toBe(0)
  })

  it('wraps prev at start', () => {
    expect(stepGalleryIndex(0, 3, 'prev')).toBe(2)
  })

  it('steps next without wrap when not at end', () => {
    expect(stepGalleryIndex(1, 3, 'next')).toBe(2)
  })
})
