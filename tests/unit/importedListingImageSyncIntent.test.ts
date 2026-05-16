import { describe, expect, it } from 'vitest'
import {
  computeImportedListingImageSyncIntent,
  saleGalleryIsHealthyForShrinkProtection,
} from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'
import { computeImageHash, normalizeImageUrlsForHash } from '@/lib/reconciliation/sourceHashing'

describe('saleGalleryIsHealthyForShrinkProtection', () => {
  it('is false when fewer than two non-logo-like images exist', () => {
    expect(
      saleGalleryIsHealthyForShrinkProtection({
        images: ['https://cdn.example.com/ystm_site_logo.png'],
        description: 'Nice sale',
      })
    ).toBe(false)
    expect(
      saleGalleryIsHealthyForShrinkProtection({
        images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/logo.png'],
        description: 'Nice sale',
      })
    ).toBe(false)
  })

  it('is false when placeholder listing detection fires', () => {
    expect(
      saleGalleryIsHealthyForShrinkProtection({
        images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
        description: 'More photos to come',
      })
    ).toBe(false)
  })

  it('is true for two valid listing photos with normal description', () => {
    expect(
      saleGalleryIsHealthyForShrinkProtection({
        images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
        description: 'Estate sale with tools and furniture.',
      })
    ).toBe(true)
  })
})

describe('computeImportedListingImageSyncIntent', () => {
  const twoGood = ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']

  it('does not contract a healthy gallery when fewer URLs sanitize', () => {
    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: 'https://cdn.example.com/a.jpg',
        images: [...twoGood, 'https://cdn.example.com/c.jpg'],
        description: 'Real sale',
      },
      sanitizedImages: twoGood,
    })
    expect(intent.kind).toBe('none')
  })

  it('uses cover_only (not full gallery replace) when cover is logo-like, gallery is healthy, and sanitized is shorter', () => {
    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: 'https://yardsaletreasuremap.com/pics/YSTM_site_logo.png',
        images: twoGood,
        description: 'Real sale',
      },
      sanitizedImages: ['https://cdn.example.com/new.jpg'],
    })
    expect(intent.kind).toBe('cover_only')
    if (intent.kind === 'cover_only') {
      expect(intent.cover_image_url).toBe(twoGood[0])
    }
  })

  it('applies cover_only when healthy gallery would shrink but cover is logo-like', () => {
    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: 'https://yardsaletreasuremap.com/pics/YSTM_site_logo.png',
        images: [...twoGood, 'https://cdn.example.com/c.jpg'],
        description: 'Real sale',
      },
      sanitizedImages: [twoGood[0]],
    })
    expect(intent.kind).toBe('cover_only')
    if (intent.kind === 'cover_only') {
      expect(intent.cover_image_url).toBe(twoGood[0])
    }
  })

  it('expands a healthy gallery when sanitized has strictly more images', () => {
    const more = [...twoGood, 'https://cdn.example.com/c.jpg', 'https://cdn.example.com/d.jpg']
    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: twoGood[0],
        images: twoGood,
        description: 'Real sale',
      },
      sanitizedImages: more,
    })
    expect(intent.kind).toBe('full')
    if (intent.kind === 'full') {
      expect(intent.images).toEqual(more)
      expect(intent.cover_image_url).toBe(twoGood[0])
    }
  })

  it('allows full replace with fewer images when gallery is not healthy', () => {
    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: 'https://yardsaletreasuremap.com/pics/YSTM_site_logo.png',
        images: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
        description: 'Yard sale',
      },
      sanitizedImages: ['https://cdn.example.com/fixed.jpg'],
    })
    expect(intent.kind).toBe('full')
    if (intent.kind === 'full') {
      expect(intent.images).toEqual(['https://cdn.example.com/fixed.jpg'])
    }
  })

  it('dedupe order is preserved in sanitized input (caller responsibility)', () => {
    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: null,
        images: [],
        description: null,
      },
      sanitizedImages: ['https://cdn.example.com/z.jpg', 'https://cdn.example.com/a.jpg'],
    })
    expect(intent.kind).toBe('full')
    if (intent.kind === 'full') {
      expect(intent.images).toEqual(['https://cdn.example.com/z.jpg', 'https://cdn.example.com/a.jpg'])
    }
  })
})

describe('image hash normalization vs source order', () => {
  it('keeps deterministic sorted hashes while source order can differ', () => {
    const a = ['https://z.com/z.jpg', 'https://a.com/a.jpg']
    const b = ['https://a.com/a.jpg', 'https://z.com/z.jpg']
    expect(normalizeImageUrlsForHash(a)).toEqual(normalizeImageUrlsForHash(b))
    expect(computeImageHash(a)).toBe(computeImageHash(b))
  })
})
