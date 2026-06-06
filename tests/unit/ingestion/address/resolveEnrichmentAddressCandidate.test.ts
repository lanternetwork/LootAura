import { describe, expect, it } from 'vitest'
import {
  isUnlockScheduledInFuture,
  resolveEnrichmentAddressCandidate,
} from '@/lib/ingestion/address/resolveEnrichmentAddressCandidate'

describe('resolveEnrichmentAddressCandidate', () => {
  const nowMs = Date.parse('2026-06-06T12:00:00.000Z')

  it('returns detail page address when geocode-ready', () => {
    const result = resolveEnrichmentAddressCandidate({
      detailPageAddressRaw: '123 Main St, Austin, TX',
      sourceUrl: 'https://yardsaletreasuremap.com/US/Texas/Austin/123-main-st/1/listing.html',
      nowMs,
    })
    expect(result.addressRaw).toContain('123 Main St')
    expect(result.source).toBe('detail_page')
  })

  it('uses url slug after unlock when detail page has no address', () => {
    const result = resolveEnrichmentAddressCandidate({
      detailPageAddressRaw: null,
      sourceUrl:
        'https://yardsaletreasuremap.com/US/Texas/Austin/456-oak-avenue/99/listing.html',
      nowMs,
    })
    expect(result.addressRaw).toContain('456 oak avenue')
    expect(result.source).toBe('url_slug_after_unlock')
  })

  it('does not slug-recover while unlock is still in the future', () => {
    const unlockFuture = new Date(nowMs + 60 * 60 * 1000).toISOString()
    expect(
      isUnlockScheduledInFuture({
        sourceUrl:
          'https://yardsaletreasuremap.com/US/Texas/Austin/See-source-for-address-after-2026-06-06-14%3A00%3A00/1/listing.html',
        addressUnlockAt: unlockFuture,
        nowMs,
      })
    ).toBe(true)

    const result = resolveEnrichmentAddressCandidate({
      detailPageAddressRaw: null,
      sourceUrl:
        'https://yardsaletreasuremap.com/US/Texas/Austin/See-source-for-address-after-2026-06-06-14%3A00%3A00/1/listing.html',
      nowMs,
    })
    expect(result.addressRaw).toBeNull()
    expect(result.source).toBeNull()
  })
})
