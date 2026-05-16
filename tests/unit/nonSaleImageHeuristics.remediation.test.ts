import { describe, expect, it } from 'vitest'
import { filterBrandingFromSaleMediaUrls } from '@/lib/ingestion/nonSaleImageHeuristics'

const GOOD = 'https://images.example.com/listing/photo-12345.jpg'
const LOGO = 'https://www.yardsaletreasuremap.com/pics/YSTM_site_logo.png'

describe('filterBrandingFromSaleMediaUrls (remediation parity with migration 169)', () => {
  it('removes branding URLs and keeps first good image as cover', () => {
    const r = filterBrandingFromSaleMediaUrls({
      coverImageUrl: LOGO,
      images: [GOOD, 'https://cdn.example.com/ystm/hero.png'],
    })
    expect(r.images).toEqual([GOOD])
    expect(r.coverImageUrl).toBe(GOOD)
  })

  it('branding-only arrays become null cover and empty images', () => {
    const r = filterBrandingFromSaleMediaUrls({
      coverImageUrl: LOGO,
      images: ['https://cdn.example.com/ystm/hero.png'],
    })
    expect(r.coverImageUrl).toBeNull()
    expect(r.images).toEqual([])
  })

  it('null cover with only valid images preserves order and first cover', () => {
    const r = filterBrandingFromSaleMediaUrls({
      coverImageUrl: null,
      images: [GOOD, 'https://other.cdn/sale/b.jpg'],
    })
    expect(r.coverImageUrl).toBe(GOOD)
    expect(r.images).toEqual([GOOD, 'https://other.cdn/sale/b.jpg'])
  })

  it('dedupes cover duplicated in images then filters branding', () => {
    const r = filterBrandingFromSaleMediaUrls({
      coverImageUrl: GOOD,
      images: [GOOD, LOGO],
    })
    expect(r.images).toEqual([GOOD])
    expect(r.coverImageUrl).toBe(GOOD)
  })

  it('is idempotent on output (second pass unchanged)', () => {
    const once = filterBrandingFromSaleMediaUrls({
      coverImageUrl: LOGO,
      images: [GOOD, LOGO],
    })
    const twice = filterBrandingFromSaleMediaUrls({
      coverImageUrl: once.coverImageUrl,
      images: once.images,
    })
    expect(twice).toEqual(once)
  })
})
