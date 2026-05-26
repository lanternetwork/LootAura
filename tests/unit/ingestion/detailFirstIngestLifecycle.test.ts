import { describe, expect, it } from 'vitest'
import { resolveDetailFirstIngestLifecycle } from '@/lib/ingestion/detailFirstIngestLifecycle'
import { resolveIngestAddressLifecycle } from '@/lib/ingestion/address/resolveIngestAddressLifecycle'

describe('resolveDetailFirstIngestLifecycle', () => {
  const gatedLifecycle = resolveIngestAddressLifecycle({
    sourceUrl:
      'https://yardsaletreasuremap.com/US/California/Santa-Ana/See-source-for-address-after-2026-05-27-06%3A00%3A00/38690519/userlisting.html',
    addressRaw: null,
    wouldBeNeedsGeocode: false,
  })

  it('uses needs_check + enrichment pending for native-first without publishable address', () => {
    const resolved = resolveDetailFirstIngestLifecycle({
      addressLifecycle: gatedLifecycle,
      normalizedLine: null,
      city: 'Santa Ana',
      state: 'CA',
      nativeFirst: true,
    })
    expect(resolved.status).toBe('needs_check')
    expect(resolved.lifecycle.addressStatus).toBe('address_enrichment_pending')
    expect(resolved.lifecycle.ingestStatus).toBe('needs_check')
  })

  it('uses ready when address line is publishable', () => {
    const resolved = resolveDetailFirstIngestLifecycle({
      addressLifecycle: gatedLifecycle,
      normalizedLine: '2249 us-17',
      city: 'Little River',
      state: 'SC',
      nativeFirst: false,
    })
    expect(resolved.status).toBe('ready')
    expect(resolved.lifecycle.addressStatus).toBe('address_available')
    expect(resolved.lifecycle.ingestStatus).toBe('ready')
  })

  it('does not mark ready when gated slug and no normalized line', () => {
    const resolved = resolveDetailFirstIngestLifecycle({
      addressLifecycle: gatedLifecycle,
      normalizedLine: null,
      city: 'Santa Ana',
      state: 'CA',
      nativeFirst: false,
    })
    expect(resolved.status).toBe('needs_check')
    expect(resolved.lifecycle.ingestStatus).toBe('needs_check')
  })
})
