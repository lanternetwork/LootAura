import { describe, expect, it } from 'vitest'
import { urlSuggestsNonListingPhoto } from '@/lib/ingestion/nonSaleImageHeuristics'

describe('urlSuggestsNonListingPhoto', () => {
  it('flags YSTM site logo under /pics/ on official host', () => {
    expect(
      urlSuggestsNonListingPhoto('https://www.yardsaletreasuremap.com/pics/YSTM_site_logo.png')
    ).toBe('ystm_host_pics_site_asset')
    expect(
      urlSuggestsNonListingPhoto('https://yardsaletreasuremap.com/pics/ystm_site_logo.png')
    ).toBe('ystm_host_pics_site_asset')
  })

  it('allows plausible listing photo filename under /pics/ on YSTM host', () => {
    expect(
      urlSuggestsNonListingPhoto('https://www.yardsaletreasuremap.com/pics/garage_sale_photo_2025.jpg')
    ).toBeNull()
  })

  it('flags ystm_site_logo token on arbitrary CDN', () => {
    expect(
      urlSuggestsNonListingPhoto('https://cdn.example.com/static/YSTM_site_logo_v2.png')
    ).toBe('ystm_branding_token')
  })

  it('allows normal listing image on non-YSTM host', () => {
    expect(urlSuggestsNonListingPhoto('https://images.estatesales.net/foo/bar.jpg')).toBeNull()
  })

  it('rejects marketing paths on YSTM host', () => {
    expect(
      urlSuggestsNonListingPhoto('https://yardsaletreasuremap.com/assets/brand/hero-logo.png')
    ).toBe('ystm_host_marketing_path')
  })
})
