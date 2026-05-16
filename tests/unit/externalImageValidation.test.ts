import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'

const { dnsLookup } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

describe('external image URL validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
  })

  it('accepts valid HTTPS public image URL', async () => {
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('https://images.example.org/a.jpg')).resolves.toBe(true)
  })

  it('rejects localhost and private targets', async () => {
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('https://localhost/a.jpg')).resolves.toBe(false)
    await expect(isValidExternalImageUrl('https://127.0.0.1/a.jpg')).resolves.toBe(false)
    await expect(isValidExternalImageUrl('https://10.0.0.8/a.jpg')).resolves.toBe(false)
  })

  it('rejects non-HTTPS URLs', async () => {
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('http://images.example.org/a.jpg')).resolves.toBe(false)
  })

  it('rejects hostnames resolving to private IPs', async () => {
    dnsLookup.mockResolvedValue([{ address: '192.168.1.9', family: 4 }])
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('https://images.example.org/a.jpg')).resolves.toBe(false)
  })
})

describe('sanitizeExternalImageUrls branding and dimension heuristics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects logo path segments without fetching', async () => {
    const { sanitizeExternalImageUrls } = await import('@/lib/ingestion/externalImageValidation')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch should not run'))
    const out = await sanitizeExternalImageUrls(['https://cdn.example.com/assets/site-logo-v2.png'], {
      rowId: '11111111-1111-4111-8111-111111111111',
      city: 'A',
      state: 'B',
      max: MAX_IMPORTED_LISTING_IMAGES,
    })
    expect(out).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('rejects YSTM / provider branding paths without fetching', async () => {
    const { sanitizeExternalImageUrls } = await import('@/lib/ingestion/externalImageValidation')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch should not run'))
    const urls = [
      'https://cdn.example.com/ystm/hero.png',
      'https://img.example.org/branding/ystm_logo.jpg',
      'https://assets.example.org/yardsale-time-machine/badge.png',
    ]
    for (const u of urls) {
      const out = await sanitizeExternalImageUrls([u], {
        rowId: '11111111-1111-4111-8111-111111111111',
        city: 'A',
        state: 'B',
        max: MAX_IMPORTED_LISTING_IMAGES,
      })
      expect(out).toEqual([])
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('rejects yardsaletreasuremap.com /pics/ site logo without fetching', async () => {
    const { sanitizeExternalImageUrls } = await import('@/lib/ingestion/externalImageValidation')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch should not run'))
    const out = await sanitizeExternalImageUrls(
      ['https://www.yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
      {
        rowId: '11111111-1111-4111-8111-111111111111',
        city: 'A',
        state: 'B',
        max: MAX_IMPORTED_LISTING_IMAGES,
      }
    )
    expect(out).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('rejects wide banner dimensions from raster probe', async () => {
    const { sanitizeExternalImageUrls, parseRasterImageDimensionsFromBytes } = await import(
      '@/lib/ingestion/externalImageValidation'
    )
    const pngHeader = new Uint8Array(24)
    pngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const w = 900
    const h = 72
    pngHeader[16] = (w >>> 24) & 0xff
    pngHeader[17] = (w >>> 16) & 0xff
    pngHeader[18] = (w >>> 8) & 0xff
    pngHeader[19] = w & 0xff
    pngHeader[20] = (h >>> 24) & 0xff
    pngHeader[21] = (h >>> 16) & 0xff
    pngHeader[22] = (h >>> 8) & 0xff
    pngHeader[23] = h & 0xff
    expect(parseRasterImageDimensionsFromBytes(pngHeader)).toEqual({ w: 900, h: 72 })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(pngHeader.buffer.slice(0, pngHeader.byteLength), { status: 206 }))
    )

    const out = await sanitizeExternalImageUrls(['https://images.example.org/hero.png'], {
      rowId: '22222222-2222-4222-8222-222222222222',
      city: 'A',
      state: 'B',
      max: MAX_IMPORTED_LISTING_IMAGES,
    })
    expect(out).toEqual([])
  })
})
