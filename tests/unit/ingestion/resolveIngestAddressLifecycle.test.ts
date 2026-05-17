import { describe, expect, it } from 'vitest'
import { resolveIngestAddressLifecycle } from '@/lib/ingestion/address/resolveIngestAddressLifecycle'

describe('resolveIngestAddressLifecycle', () => {
  const gatedUrl =
    'https://yardsaletreasuremap.com/US/Indiana/Valparaiso/See-source-for-address-after-2026-06-01-10%3A00%3A00/38740001/userlisting.html?s=tl'

  it('keeps gated null-address rows on needs_check with address_gated/pending', () => {
    const resolved = resolveIngestAddressLifecycle({
      sourceUrl: gatedUrl,
      addressRaw: null,
      wouldBeNeedsGeocode: true,
      diagnostics: { slugWasPlaceholder: true, chosenAddressSource: 'none' },
      now: new Date('2026-05-01T00:00:00.000Z'),
    })
    expect(resolved.ingestStatus).toBe('needs_check')
    expect(['address_gated', 'address_enrichment_pending']).toContain(resolved.addressStatus)
    expect(resolved.nextEnrichmentAttemptAt).not.toBeNull()
  })

  it('promotes usable address to needs_geocode with address_available', () => {
    const resolved = resolveIngestAddressLifecycle({
      sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/100-Main-St/1/userlisting.html',
      addressRaw: '100 Main St, Chicago, IL',
      wouldBeNeedsGeocode: true,
    })
    expect(resolved.ingestStatus).toBe('needs_geocode')
    expect(resolved.addressStatus).toBe('address_available')
    expect(resolved.nextEnrichmentAttemptAt).toBeNull()
  })

  it('never assigns needs_geocode without usable address', () => {
    const resolved = resolveIngestAddressLifecycle({
      sourceUrl: gatedUrl,
      addressRaw: null,
      wouldBeNeedsGeocode: true,
    })
    expect(resolved.ingestStatus).not.toBe('needs_geocode')
  })
})
