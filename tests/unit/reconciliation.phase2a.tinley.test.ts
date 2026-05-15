import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyReconciliationChange } from '@/lib/reconciliation/reconciliationClassifier'
import { detectPlaceholderListing } from '@/lib/reconciliation/placeholderDetection'
import { fingerprintFromParts } from '@/lib/reconciliation/sourceHashing'
import { buildSafePublishedSaleSyncPatch } from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'

vi.mock('@/lib/ingestion/externalImageValidation', () => ({
  sanitizeExternalImageUrls: async (candidates: unknown) => {
    if (!Array.isArray(candidates)) return []
    return candidates.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
  },
}))

vi.mock('@/lib/sales/resolvePersistableSaleEndsAt', () => ({
  resolvePersistableSaleEndsAt: vi.fn().mockResolvedValue({
    ends_at: '2026-05-17T20:00:00.000Z',
    listing_timezone: 'America/Chicago',
  }),
}))

describe('Phase 2A Tinley Park safe sync patch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upgrades placeholder description, images, inferred closing time, and ends_at without touching address', async () => {
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

    const classification = classifyReconciliationChange({
      priorFingerprint: initial,
      nextFingerprint: updated,
      priorPlaceholder: true,
      nextPlaceholder: false,
    })

    const sale = {
      id: 'sale-1',
      ingested_sale_id: 'ingest-1',
      title: "CAIT'S® Tinley Park Estate Sale",
      description:
        'MORE INFORMATION AND PICTURES COMING SOON. Hours 9:00 AM to 2:00 PM. Address 16713 Ridgeland Ave, Tinley Park, IL.',
      address: '16713 Ridgeland Ave, Tinley Park, IL 60477',
      city: 'Tinley Park',
      state: 'IL',
      zip_code: '60477',
      lat: 41.57,
      lng: -87.79,
      date_start: '2026-05-15',
      date_end: '2026-05-16',
      time_start: null as string | null,
      time_end: null as string | null,
      ends_at: '2026-05-17T19:00:00.000Z',
      listing_timezone: 'America/Chicago',
      cover_image_url: 'https://yardsaletreasuremap.com/pics/YSTM_site_logo.png',
      images: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
      moderation_status: null as string | null,
    }

    const snapshot = {
      title: "CAIT'S® Tinley Park Estate Sale",
      description:
        'Full estate with furniture, jewelry, and tools. Hours 9:00 AM to 3:00 PM. 16713 Ridgeland Ave, Tinley Park, IL.',
      imageUrls: ['https://cdn.example.com/lot-table.jpg', 'https://cdn.example.com/lot-lamp.jpg'] as const,
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
    }

    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale,
      snapshot,
      ingest: {
        normalized_address: '16713 Ridgeland Ave',
        zip_code: '60477',
        lat: 41.57,
        lng: -87.79,
        time_start: null,
        time_end: null,
        raw_payload: {},
        image_source_url: null,
      },
      classes: classification.classes,
      priorFingerprint: initial,
      nextFingerprint: updated,
      city: 'Tinley Park',
      state: 'IL',
      rowId: 'ingest-1',
      saleId: 'sale-1',
    })

    expect(built.patch.address).toBeUndefined()
    expect(String(built.patch.description)).toContain('Full estate')
    expect(built.patch.images).toEqual(
      ['https://cdn.example.com/lot-lamp.jpg', 'https://cdn.example.com/lot-table.jpg'].sort((a, b) =>
        a.localeCompare(b)
      )
    )
    expect(built.patch.time_end).toBe('15:00:00')
    expect(built.patch.ends_at).toBe('2026-05-17T20:00:00.000Z')
    expect(built.descriptionsUpdated).toBe(true)
    expect(built.imagesUpdated).toBe(true)
    expect(built.schedulesUpdated).toBe(true)
  })

  it('does not replace strong existing image sets with fewer source images', async () => {
    const prior = fingerprintFromParts({
      title: 'Estate Sale',
      description: 'Many items.',
      dateStart: '2026-06-01',
      dateEnd: '2026-06-01',
      timeStart: '09:00:00',
      timeEnd: '15:00:00',
      listingTimezone: 'America/Chicago',
      imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg', 'https://cdn.example.com/c.jpg'],
    })
    const next = fingerprintFromParts({
      title: 'Estate Sale',
      description: 'Many items and more.',
      dateStart: '2026-06-01',
      dateEnd: '2026-06-01',
      timeStart: '09:00:00',
      timeEnd: '15:00:00',
      listingTimezone: 'America/Chicago',
      imageUrls: ['https://cdn.example.com/a.jpg'],
    })
    const classification = classifyReconciliationChange({
      priorFingerprint: prior,
      nextFingerprint: next,
      priorPlaceholder: false,
      nextPlaceholder: false,
    })
    const sale = {
      id: 's',
      ingested_sale_id: 'i',
      title: 'Estate Sale',
      description: 'Many items.',
      address: '1 Main St, City, ST 12345',
      city: 'City',
      state: 'ST',
      zip_code: '12345',
      lat: 40,
      lng: -74,
      date_start: '2026-06-01',
      date_end: '2026-06-01',
      time_start: '09:00:00',
      time_end: '15:00:00',
      ends_at: '2026-06-01T19:00:00.000Z',
      listing_timezone: 'America/New_York',
      cover_image_url: 'https://cdn.example.com/a.jpg',
      images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg', 'https://cdn.example.com/c.jpg'],
      moderation_status: null as string | null,
    }
    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale,
      snapshot: {
        title: 'Estate Sale',
        description: 'Many items and more.',
        imageUrls: ['https://cdn.example.com/a.jpg'],
        dateStart: '2026-06-01',
        dateEnd: '2026-06-01',
      },
      ingest: {
        normalized_address: '1 Main St',
        zip_code: '12345',
        lat: 40,
        lng: -74,
        time_start: '09:00:00',
        time_end: '15:00:00',
        raw_payload: {},
        image_source_url: null,
      },
      classes: classification.classes,
      priorFingerprint: prior,
      nextFingerprint: next,
      city: 'City',
      state: 'ST',
      rowId: 'i',
      saleId: 's',
    })
    expect(built.patch.images).toBeUndefined()
    expect(built.imagesUpdated).toBe(false)
  })
})

describe('Phase 2A ingest vs sale address manual review', () => {
  it('flags when normalized ingest line differs from sale display line', async () => {
    const { computeIngestVsSaleAddressManualReview } = await import('@/lib/reconciliation/syncPublishedSaleFromReconciledSource')
    const drift = computeIngestVsSaleAddressManualReview({
      ingestNormalizedAddress: '999 Other Rd',
      ingestCity: 'Tinley Park',
      ingestState: 'IL',
      saleAddress: '16713 Ridgeland Ave, Tinley Park, IL 60477',
      saleCity: 'Tinley Park',
      saleState: 'IL',
    })
    expect(drift).toBe(true)
  })
})

describe('Phase 2A placeholder detection on refreshed description', () => {
  it('does not treat refreshed Tinley prose as placeholder', () => {
    const p = detectPlaceholderListing({
      description:
        'Full estate with furniture, jewelry, and tools. Hours 9:00 AM to 3:00 PM. 16713 Ridgeland Ave, Tinley Park, IL.',
      imageUrls: ['https://cdn.example.com/lot-table.jpg'],
    })
    expect(p.isPlaceholder).toBe(false)
  })
})
