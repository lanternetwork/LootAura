import { describe, expect, it } from 'vitest'
import {
  computeNextEnrichmentAttemptAt,
  detectGatedListing,
  parseSeeSourceUnlockAtFromSlug,
} from '@/lib/ingestion/address/addressGated'

describe('addressGated', () => {
  it('parses unlock timestamp from URL-encoded See-source slug', () => {
    const unlock = parseSeeSourceUnlockAtFromSlug(
      'See-source-for-address-after-2026-05-08-22%3A00%3A00'
    )
    expect(unlock).not.toBeNull()
    expect(unlock?.toISOString()).toBe('2026-05-08T22:00:00.000Z')
  })

  it('detects gated when slug is See-source and address is null', () => {
    const url =
      'https://yardsaletreasuremap.com/US/Illinois/Oak-Brook/See-source-for-address-after-2026-05-08-22%3A00%3A00/38733355/userlisting.html?s=tl'
    const gated = detectGatedListing({ sourceUrl: url, addressRaw: null })
    expect(gated.gated).toBe(true)
    expect(gated.unlockAt?.toISOString()).toBe('2026-05-08T22:00:00.000Z')
  })

  it('does not gate userlisting with real address slug', () => {
    const url =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/15200-S-80th-Ave/161028326/userlisting.html'
    const gated = detectGatedListing({
      sourceUrl: url,
      addressRaw: '15200 S 80th Ave, Chicago, IL',
    })
    expect(gated.gated).toBe(false)
  })

  it('detects gated from ES.net utcShowAddressAfter when address is null', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const gated = detectGatedListing({
      sourceUrl: 'https://www.estatesales.net/KY/Louisville/40204/4926588',
      addressRaw: null,
      diagnostics: { utcShowAddressAfter: future },
    })
    expect(gated.gated).toBe(true)
    expect(gated.unlockAt?.toISOString()).toBe(future)
  })

  it('does not gate See-source URL when metadata supplied usable address', () => {
    const url =
      'https://yardsaletreasuremap.com/US/Illinois/Elmwood-Park/See-source-for-address-after-2026-05-08-22%3A00%3A00/38733355/userlisting.html?s=tl'
    const gated = detectGatedListing({
      sourceUrl: url,
      addressRaw: '1234 W Fullerton Ave, Elmwood Park, IL',
    })
    expect(gated.gated).toBe(false)
  })

  it('schedules next attempt at or after unlock with jitter bound', () => {
    const unlock = new Date('2026-05-10T10:00:00.000Z')
    const now = new Date('2026-05-09T00:00:00.000Z')
    const next = computeNextEnrichmentAttemptAt(unlock, now.getTime(), 'seed-1')
    expect(next.getTime()).toBeGreaterThanOrEqual(unlock.getTime())
    expect(next.getTime()).toBeLessThanOrEqual(unlock.getTime() + 120_000)
  })
})
