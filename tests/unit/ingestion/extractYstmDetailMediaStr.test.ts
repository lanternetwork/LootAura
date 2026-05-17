import { describe, expect, it } from 'vitest'
import { extractYstmDetailMediaStrFromHtml } from '@/lib/ingestion/images/extractYstmDetailMediaStr'
import { mergeIngestedSaleImageFields } from '@/lib/ingestion/images/mergeIngestedSaleImageFields'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'

const PAGE_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'

const MEDIA_STR_FIXTURE = `const mediaStr = '{"baseUrl":"https:\\/\\/gsf.tlstatic.com\\/image\\/w700-h500\\/2026\\/05\\/16\\/s\\/4\\/3\\/21584843","media":["XXMwY-0.jpeg","2MdD-0.jpeg","XDvt4-0.jpeg"],"listingUrl":"https:\\/\\/garagesalefinder.com\\/s\\/x"}';`

describe('extractYstmDetailMediaStrFromHtml', () => {
  it('parses baseUrl + media[] into absolute HTTPS URLs', () => {
    const html = `<html><body><script>${MEDIA_STR_FIXTURE}</script></body></html>`
    const result = extractYstmDetailMediaStrFromHtml(html, PAGE_URL)
    expect(result.mediaStrFound).toBe(true)
    expect(result.imageUrls).toEqual([
      'https://gsf.tlstatic.com/image/w700-h500/2026/05/16/s/4/3/21584843/XXMwY-0.jpeg',
      'https://gsf.tlstatic.com/image/w700-h500/2026/05/16/s/4/3/21584843/2MdD-0.jpeg',
      'https://gsf.tlstatic.com/image/w700-h500/2026/05/16/s/4/3/21584843/XDvt4-0.jpeg',
    ])
    expect(result.urlFingerprints).toHaveLength(3)
  })

  it('rejects logo paths in media array', () => {
    const html = `<script>const mediaStr = '{"baseUrl":"https://yardsaletreasuremap.com/pics","media":["YSTM_site_logo.png","real.jpeg"]}';</script>`
    const result = extractYstmDetailMediaStrFromHtml(html, PAGE_URL)
    expect(result.imageUrls).toHaveLength(0)
    expect(result.rejectedCount).toBeGreaterThan(0)
  })

  it('dedupes duplicate media filenames', () => {
    const html = `<script>const mediaStr = '{"baseUrl":"https://cdn.example.com/a","media":["one.jpeg","one.jpeg","two.jpeg"]}';</script>`
    const result = extractYstmDetailMediaStrFromHtml(html, PAGE_URL)
    expect(result.imageUrls).toEqual(['https://cdn.example.com/a/one.jpeg', 'https://cdn.example.com/a/two.jpeg'])
  })

  it('caps at MAX_IMPORTED_LISTING_IMAGES', () => {
    const media = Array.from({ length: 12 }, (_, i) => `"p${i}.jpeg"`).join(',')
    const html = `<script>const mediaStr = '{"baseUrl":"https://cdn.example.com/base","media":[${media}]}';</script>`
    const result = extractYstmDetailMediaStrFromHtml(html, PAGE_URL, 10)
    expect(result.imageUrls).toHaveLength(10)
  })

  it('returns mediaStrFound false when blob missing', () => {
    const result = extractYstmDetailMediaStrFromHtml('<html></html>', PAGE_URL)
    expect(result.mediaStrFound).toBe(false)
    expect(result.imageUrls).toEqual([])
  })
})

describe('mergeIngestedSaleImageFields', () => {
  it('sets image_source_url to first merged URL', () => {
    const merged = mergeIngestedSaleImageFields({
      existingImageSourceUrl: null,
      existingRawPayload: {},
      newUrls: ['https://gsf.tlstatic.com/image/a/1.jpeg', 'https://gsf.tlstatic.com/image/a/2.jpeg'],
    })
    expect(merged.updated).toBe(true)
    expect(merged.imageSourceUrl).toBe('https://gsf.tlstatic.com/image/a/1.jpeg')
    expect(merged.rawPayload.imageUrls).toEqual([
      'https://gsf.tlstatic.com/image/a/1.jpeg',
      'https://gsf.tlstatic.com/image/a/2.jpeg',
    ])
  })

  it('preserves existing valid URLs without overwrite', () => {
    const existing = ['https://cdn.example.com/existing.jpg']
    const merged = mergeIngestedSaleImageFields({
      existingImageSourceUrl: existing[0],
      existingRawPayload: { imageUrls: existing },
      newUrls: ['https://gsf.tlstatic.com/image/a/new.jpeg'],
    })
    expect(merged.updated).toBe(false)
    expect(merged.preservedExisting).toBe(true)
    expect(merged.rawPayload.imageUrls).toEqual(existing)
  })

  it('appends new URLs when existing list is empty', () => {
    const merged = mergeIngestedSaleImageFields({
      existingImageSourceUrl: null,
      existingRawPayload: { adapter: 'external_page_source' },
      newUrls: ['https://gsf.tlstatic.com/image/a/1.jpeg'],
    })
    expect(merged.updated).toBe(true)
    expect(merged.rawPayload.adapter).toBe('external_page_source')
  })
})

describe('isYstmDetailListingUrl', () => {
  it('accepts YSTM listing and userlisting detail URLs', () => {
    expect(isYstmDetailListingUrl(PAGE_URL)).toBe(true)
    expect(
      isYstmDetailListingUrl(
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/1-Main-St/99/listing.html'
      )
    ).toBe(true)
  })

  it('rejects list hub pages', () => {
    expect(isYstmDetailListingUrl('https://yardsaletreasuremap.com/US/Illinois/Chicago.html')).toBe(
      false
    )
  })
})
