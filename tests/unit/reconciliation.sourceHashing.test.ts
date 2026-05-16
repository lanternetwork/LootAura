import { describe, expect, it } from 'vitest'
import {
  computeContentHash,
  computeImageHash,
  computeScheduleHash,
  extractScheduleWindowTokenFromText,
  fingerprintFromParts,
  normalizeImageUrlsForHash,
} from '@/lib/reconciliation/sourceHashing'

describe('sourceHashing', () => {
  it('is deterministic for content and image hashes', () => {
    const c1 = computeContentHash('  Hello ', 'World\n\t')
    const c2 = computeContentHash('hello', 'world')
    expect(c1).toBe(c2)
    const i1 = computeImageHash(['https://b.com/z', 'https://a.com/a'])
    const i2 = computeImageHash(['https://a.com/a', 'https://b.com/z'])
    expect(i1).toBe(i2)
    expect(normalizeImageUrlsForHash(['https://b.com/z', 'https://a.com/a'])).toEqual(['https://a.com/a', 'https://b.com/z'])
  })

  it('embeds description-derived schedule window in schedule hash', () => {
    const a = computeScheduleHash({
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      descriptionScheduleAux: extractScheduleWindowTokenFromText('Hours 9:00 AM to 2:00 PM Saturday'),
    })
    const b = computeScheduleHash({
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      descriptionScheduleAux: extractScheduleWindowTokenFromText('Hours 9:00 AM to 3:00 PM Saturday'),
    })
    expect(a).not.toBe(b)
  })

  it('fingerprintFromParts matches stable expectations across runs', () => {
    const fp = fingerprintFromParts({
      title: "CAIT'S® Tinley Park Estate Sale",
      description: 'MORE INFORMATION AND PICTURES COMING SOON',
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      imageUrls: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
    })
    const fp2 = fingerprintFromParts({
      title: "CAIT'S® Tinley Park Estate Sale",
      description: 'MORE INFORMATION AND PICTURES COMING SOON',
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      imageUrls: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
    })
    expect(fp.contentHash).toBe(fp2.contentHash)
    expect(fp.scheduleHash).toBe(fp2.scheduleHash)
    expect(fp.imageHash).toBe(fp2.imageHash)
  })
})
