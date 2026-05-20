import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractDetailPageAddressFromHtml } from '@/lib/ingestion/address/extractDetailPageAddress'
import { extractDetailPageListingEnrichmentFromHtml } from '@/lib/ingestion/address/extractDetailPageListingEnrichment'

const LOUISVILLE_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

describe('extractDetailPageListingEnrichmentFromHtml', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses Louisville detail fixture with address, dates, and native coords', () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-louisville-devondale.html'),
      'utf8'
    )
    const enrichment = extractDetailPageListingEnrichmentFromHtml({
      html,
      sourceUrl: LOUISVILLE_URL,
      city: 'Louisville',
      state: 'KY',
    })

    expect(enrichment).not.toBeNull()
    expect(enrichment!.addressRaw).toContain('1802 Devondale Dr')
    expect(enrichment!.title).toBe('Our Biggest Yard Sale')
    expect(enrichment!.startDate).toBe('2026-05-23')
    expect(enrichment!.chosenAddressSource).toBe('ystm_detail_dom')
    expect(enrichment!.nativeCoords).toMatchObject({ lat: 38.276708, lng: -85.613833 })
  })

  it('extractDetailPageAddressFromHtml stays aligned with listing enrichment', () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-louisville-devondale.html'),
      'utf8'
    )
    const enrichment = extractDetailPageListingEnrichmentFromHtml({
      html,
      sourceUrl: LOUISVILLE_URL,
      city: 'Louisville',
      state: 'KY',
    })
    const addressOnly = extractDetailPageAddressFromHtml({
      html,
      sourceUrl: LOUISVILLE_URL,
      city: 'Louisville',
      state: 'KY',
      sourcePlatform: 'external_page_source',
    })
    expect(addressOnly.addressRaw).toBe(enrichment?.addressRaw ?? null)
  })
})
