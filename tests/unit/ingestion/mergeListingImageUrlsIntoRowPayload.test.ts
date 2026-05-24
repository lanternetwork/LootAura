import { describe, expect, it } from 'vitest'
import { mergeListingImageUrlsIntoRowPayload } from '@/lib/ingestion/acquisition/mergeListingImageUrlsIntoRowPayload'

describe('mergeListingImageUrlsIntoRowPayload', () => {
  it('copies imageUrls from listing.rawPayload into rowPayload', () => {
    const merged = mergeListingImageUrlsIntoRowPayload(
      { detailFirstReady: true, page_index: 0 },
      {
        rawPayload: {
          imageUrls: [
            'https://gsf.tlstatic.com/image/a.jpeg',
            'https://gsf.tlstatic.com/image/b.jpeg',
          ],
        },
      }
    )
    expect(merged.imageUrls).toEqual([
      'https://gsf.tlstatic.com/image/a.jpeg',
      'https://gsf.tlstatic.com/image/b.jpeg',
    ])
    expect(merged.detailFirstReady).toBe(true)
  })

  it('leaves rowPayload unchanged when listing has no imageUrls', () => {
    const base = { page_index: 1 }
    const merged = mergeListingImageUrlsIntoRowPayload(base, { rawPayload: {} })
    expect(merged).toEqual(base)
    expect(merged).not.toHaveProperty('imageUrls')
  })

  it('overwrites stale empty imageUrls on rowPayload when listing has urls', () => {
    const merged = mergeListingImageUrlsIntoRowPayload(
      { imageUrls: [] },
      { rawPayload: { imageUrls: ['https://cdn.example.com/one.jpg'] } }
    )
    expect(merged.imageUrls).toEqual(['https://cdn.example.com/one.jpg'])
  })
})
