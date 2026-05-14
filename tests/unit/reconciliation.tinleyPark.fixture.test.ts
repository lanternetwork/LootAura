import { describe, expect, it } from 'vitest'
import { detectPlaceholderListing } from '@/lib/reconciliation/placeholderDetection'
import { classifyReconciliationChange } from '@/lib/reconciliation/reconciliationClassifier'
import { fingerprintFromParts } from '@/lib/reconciliation/sourceHashing'

const LISTING_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Tinley-Park/16713-Ridgeland-Ave/161028326/listing.html'

describe('Tinley Park CAIT placeholder → full listing (detection-only)', () => {
  const initial = fingerprintFromParts({
    title: "CAIT'S® Tinley Park Estate Sale",
    description:
      'MORE INFORMATION AND PICTURES COMING SOON. Hours 9:00 AM to 2:00 PM. Address 16713 Ridgeland Ave, Tinley Park, IL.',
    dateStart: '2026-05-15',
    dateEnd: '2026-05-16',
    timeStart: null,
    timeEnd: null,
    listingTimezone: null,
    imageUrls: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
  })

  const updated = fingerprintFromParts({
    title: "CAIT'S® Tinley Park Estate Sale",
    description:
      'Full estate with furniture, jewelry, and tools. Hours 9:00 AM to 3:00 PM. 16713 Ridgeland Ave, Tinley Park, IL.',
    dateStart: '2026-05-15',
    dateEnd: '2026-05-16',
    timeStart: null,
    timeEnd: null,
    listingTimezone: null,
    imageUrls: ['https://cdn.example.com/lot-table.jpg', 'https://cdn.example.com/lot-lamp.jpg'],
  })

  it('detects placeholder then resolved', () => {
    const p0 = detectPlaceholderListing({
      description:
        'MORE INFORMATION AND PICTURES COMING SOON. Hours 9:00 AM to 2:00 PM. Address 16713 Ridgeland Ave, Tinley Park, IL.',
      imageUrls: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
    })
    const p1 = detectPlaceholderListing({
      description:
        'Full estate with furniture, jewelry, and tools. Hours 9:00 AM to 3:00 PM. 16713 Ridgeland Ave, Tinley Park, IL.',
      imageUrls: ['https://cdn.example.com/lot-table.jpg', 'https://cdn.example.com/lot-lamp.jpg'],
    })
    expect(p0.isPlaceholder).toBe(true)
    expect(p1.isPlaceholder).toBe(false)
  })

  it('has distinct hashes across initial vs updated snapshots', () => {
    expect(initial.contentHash).not.toBe(updated.contentHash)
    expect(initial.imageHash).not.toBe(updated.imageHash)
    expect(initial.scheduleHash).not.toBe(updated.scheduleHash)
  })

  it('classifies combined material + placeholder resolution without duplicate tags', () => {
    const r = classifyReconciliationChange({
      priorFingerprint: initial,
      nextFingerprint: updated,
      priorPlaceholder: true,
      nextPlaceholder: false,
    })
    expect(new Set(r.classes).size).toBe(r.classes.length)
    expect(r.classes).toContain('description_changed')
    expect(r.classes).toContain('images_changed')
    expect(r.classes).toContain('schedule_changed')
    expect(r.classes).toContain('placeholder_resolved')
    expect(r.primary).toBe('placeholder_resolved')
  })

  it('anchors regression to stable listing URL shape', () => {
    expect(LISTING_URL).toMatch(/listing\.html$/i)
    expect(LISTING_URL).toContain('Tinley-Park')
  })
})
