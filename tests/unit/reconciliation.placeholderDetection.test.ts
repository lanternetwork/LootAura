import { describe, expect, it } from 'vitest'
import { detectPlaceholderListing } from '@/lib/reconciliation/placeholderDetection'

describe('placeholderDetection', () => {
  it('flags coming-soon descriptions', () => {
    const r = detectPlaceholderListing({
      description: 'MORE INFORMATION AND PICTURES COMING SOON',
      imageUrls: [],
    })
    expect(r.isPlaceholder).toBe(true)
    expect(r.reasons).toContain('description_placeholder_phrase')
    expect(r.reasons).toContain('no_images')
  })

  it('flags branding-only images', () => {
    const r = detectPlaceholderListing({
      description: 'Full estate sale with antiques.',
      imageUrls: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
    })
    expect(r.isPlaceholder).toBe(true)
    expect(r.reasons).toContain('branding_or_non_listing_images_only')
  })

  it('does not flag complete listing', () => {
    const r = detectPlaceholderListing({
      description: 'CAIT estate sale featuring furniture and collectibles.',
      imageUrls: ['https://cdn.example.com/lot-a.jpg', 'https://cdn.example.com/lot-b.jpg'],
    })
    expect(r.isPlaceholder).toBe(false)
    expect(r.reasons).toEqual([])
  })
})
