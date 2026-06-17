import { describe, expect, it } from 'vitest'
import { resolveDetailFirstIngestLifecycle } from '@/lib/ingestion/detailFirstIngestLifecycle'
import { resolveIngestAddressLifecycle } from '@/lib/ingestion/address/resolveIngestAddressLifecycle'

const NOW = new Date('2026-06-17T12:00:00.000Z')

const FUTURE_GATED_URL =
  'https://yardsaletreasuremap.com/US/California/Santa-Ana/See-source-for-address-after-2026-12-01-06%3A00%3A00/38690519/userlisting.html'

describe('resolveDetailFirstIngestLifecycle', () => {
  const futureGatedLifecycle = resolveIngestAddressLifecycle({
    sourceUrl: FUTURE_GATED_URL,
    addressRaw: null,
    wouldBeNeedsGeocode: false,
    now: NOW,
  })

  it('uses address_gated for native-first before unlock (aligned with non-native)', () => {
    const native = resolveDetailFirstIngestLifecycle({
      addressLifecycle: futureGatedLifecycle,
      normalizedLine: null,
      city: 'Santa Ana',
      state: 'CA',
      nativeFirst: true,
    })
    const nonNative = resolveDetailFirstIngestLifecycle({
      addressLifecycle: futureGatedLifecycle,
      normalizedLine: null,
      city: 'Santa Ana',
      state: 'CA',
      nativeFirst: false,
    })

    expect(native.status).toBe('needs_check')
    expect(native.lifecycle.addressStatus).toBe('address_gated')
    expect(native.lifecycle.ingestStatus).toBe('needs_check')
    expect(nonNative.lifecycle.addressStatus).toBe('address_gated')
    expect(native.lifecycle).toEqual(nonNative.lifecycle)
  })

  it('uses ready when address line is publishable', () => {
    const resolved = resolveDetailFirstIngestLifecycle({
      addressLifecycle: futureGatedLifecycle,
      normalizedLine: '2249 us-17',
      city: 'Little River',
      state: 'SC',
      nativeFirst: false,
    })
    expect(resolved.status).toBe('ready')
    expect(resolved.lifecycle.addressStatus).toBe('address_available')
    expect(resolved.lifecycle.ingestStatus).toBe('ready')
  })

  it('uses enrichment pending after unlock when address still not publishable', () => {
    const pastGatedLifecycle = resolveIngestAddressLifecycle({
      sourceUrl:
        'https://yardsaletreasuremap.com/US/California/Santa-Ana/See-source-for-address-after-2026-05-27-06%3A00%3A00/38690519/userlisting.html',
      addressRaw: null,
      wouldBeNeedsGeocode: false,
      now: NOW,
    })

    const resolved = resolveDetailFirstIngestLifecycle({
      addressLifecycle: pastGatedLifecycle,
      normalizedLine: null,
      city: 'Santa Ana',
      state: 'CA',
      nativeFirst: true,
    })
    expect(resolved.status).toBe('needs_check')
    expect(resolved.lifecycle.addressStatus).toBe('address_enrichment_pending')
  })
})
