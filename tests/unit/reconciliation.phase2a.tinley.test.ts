import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyReconciliationChange } from '@/lib/reconciliation/reconciliationClassifier'
import { detectPlaceholderListing } from '@/lib/reconciliation/placeholderDetection'
import {
  RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
  buildReconciledScheduleBundle,
  buildReconciliationIngestFingerprint,
} from '@/lib/reconciliation/reconciledScheduleBundle'
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

const tinleyIngest = {
  date_start: '2026-05-15' as string | null,
  date_end: '2026-05-16' as string | null,
  time_start: null as string | null,
  time_end: null as string | null,
  raw_payload: {},
}

describe('Phase 2A Tinley Park safe sync patch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upgrades placeholder description, images, inferred closing time, and ends_at without touching address', async () => {
    const placeholderDesc =
      'MORE INFORMATION AND PICTURES COMING SOON. Hours 9:00 AM to 2:00 PM. Address 16713 Ridgeland Ave, Tinley Park, IL.'
    const initial = buildReconciliationIngestFingerprint({
      title: "CAIT'S® Tinley Park Estate Sale",
      description: placeholderDesc,
      imageUrls: ['https://yardsaletreasuremap.com/pics/YSTM_site_logo.png'],
      ingest: tinleyIngest,
      parsed: null,
      sale: null,
      refreshedDescription: placeholderDesc,
      priorScheduleHashForFallback: RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
      lat: 41.57,
      lng: -87.79,
    }).fingerprint

    const snapshot = {
      title: "CAIT'S® Tinley Park Estate Sale",
      description:
        'Full estate with furniture, jewelry, and tools. Hours 9:00 AM to 3:00 PM. 16713 Ridgeland Ave, Tinley Park, IL.',
      imageUrls: ['https://cdn.example.com/lot-table.jpg', 'https://cdn.example.com/lot-lamp.jpg'] as const,
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
    }

    const sale = {
      id: 'sale-1',
      ingested_sale_id: 'ingest-1',
      title: "CAIT'S® Tinley Park Estate Sale",
      description: placeholderDesc,
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

    const updated = buildReconciliationIngestFingerprint({
      title: snapshot.title,
      description: snapshot.description,
      imageUrls: snapshot.imageUrls,
      ingest: tinleyIngest,
      parsed: snapshot,
      sale: {
        date_start: sale.date_start,
        date_end: sale.date_end,
        time_start: sale.time_start,
        time_end: sale.time_end,
      },
      refreshedDescription: snapshot.description,
      priorScheduleHashForFallback: initial.scheduleHash,
      lat: 41.57,
      lng: -87.79,
    }).fingerprint

    const classification = classifyReconciliationChange({
      priorFingerprint: initial,
      nextFingerprint: updated,
      priorPlaceholder: true,
      nextPlaceholder: false,
    })

    const scheduleBundleResult = buildReconciledScheduleBundle({
      refreshedDescription: snapshot.description,
      parsed: snapshot,
      ingest: {
        date_start: tinleyIngest.date_start,
        date_end: tinleyIngest.date_end,
        time_start: tinleyIngest.time_start,
        time_end: tinleyIngest.time_end,
        raw_payload: tinleyIngest.raw_payload,
      },
      sale: {
        date_start: sale.date_start,
        date_end: sale.date_end,
        time_start: sale.time_start,
        time_end: sale.time_end,
      },
      lat: 41.57,
      lng: -87.79,
    })
    expect(scheduleBundleResult.ok).toBe(true)

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
      scheduleBundleResult,
    })

    expect(built.patch.address).toBeUndefined()
    expect(String(built.patch.description)).toContain('Full estate')
    expect(built.patch.images).toEqual([
      'https://cdn.example.com/lot-table.jpg',
      'https://cdn.example.com/lot-lamp.jpg',
    ])
    expect(built.patch.time_end).toBe('15:00:00')
    expect(built.patch.ends_at).toBe('2026-05-17T20:00:00.000Z')
    expect(built.descriptionsUpdated).toBe(true)
    expect(built.imagesUpdated).toBe(true)
    expect(built.schedulesUpdated).toBe(true)
  })

  it('does not replace strong existing image sets with fewer source images', async () => {
    const ingestImg = {
      date_start: '2026-06-01' as string | null,
      date_end: '2026-06-01' as string | null,
      time_start: '09:00:00' as string | null,
      time_end: '15:00:00' as string | null,
      raw_payload: { listing_timezone: 'America/Chicago' },
    }
    const desc = 'Many items.'
    const prior = buildReconciliationIngestFingerprint({
      title: 'Estate Sale',
      description: desc,
      imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg', 'https://cdn.example.com/c.jpg'],
      ingest: ingestImg,
      parsed: null,
      sale: null,
      refreshedDescription: desc,
      priorScheduleHashForFallback: RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
      lat: 40,
      lng: -74,
    }).fingerprint
    const snapshot = {
      title: 'Estate Sale',
      description: 'Many items and more.',
      imageUrls: ['https://cdn.example.com/a.jpg'] as const,
      dateStart: '2026-06-01',
      dateEnd: '2026-06-01',
    }
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
    const next = buildReconciliationIngestFingerprint({
      title: snapshot.title,
      description: snapshot.description,
      imageUrls: snapshot.imageUrls,
      ingest: ingestImg,
      parsed: snapshot,
      sale: {
        date_start: sale.date_start,
        date_end: sale.date_end,
        time_start: sale.time_start,
        time_end: sale.time_end,
      },
      refreshedDescription: snapshot.description,
      priorScheduleHashForFallback: prior.scheduleHash,
      lat: 40,
      lng: -74,
    }).fingerprint
    const classification = classifyReconciliationChange({
      priorFingerprint: prior,
      nextFingerprint: next,
      priorPlaceholder: false,
      nextPlaceholder: false,
    })
    const scheduleBundleResult = buildReconciledScheduleBundle({
      refreshedDescription: snapshot.description,
      parsed: snapshot,
      ingest: {
        date_start: ingestImg.date_start,
        date_end: ingestImg.date_end,
        time_start: ingestImg.time_start,
        time_end: ingestImg.time_end,
        raw_payload: ingestImg.raw_payload,
      },
      sale: {
        date_start: sale.date_start,
        date_end: sale.date_end,
        time_start: sale.time_start,
        time_end: sale.time_end,
      },
      lat: 40,
      lng: -74,
    })
    expect(scheduleBundleResult.ok).toBe(true)

    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale,
      snapshot,
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
      scheduleBundleResult,
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
