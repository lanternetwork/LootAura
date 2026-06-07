import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { parseYstmDetailListingFromHtml } from '@/lib/ingestion/acquisition/ystmDetailFirstReady'
import type { ExternalPageSourceListing } from '@/lib/ingestion/adapters/externalPageSource'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { classifyYstmDetailAsValidActive } from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'

const SHORT_USERLISTING = 'https://yardsaletreasuremap.com/961002738/userlisting.html'
const SHORT_LISTING = 'https://yardsaletreasuremap.com/961002738/listing.html'
const SHORT_USERLISTING_TL = 'https://yardsaletreasuremap.com/961002738/userlisting.html?s=tl'
const LONG_USERLISTING =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

const CONFIG = {
  city: 'Chicago',
  state: 'IL',
  source_platform: 'external_page_source',
  source_pages: [] as string[],
}

function listSeed(sourceUrl: string): ExternalPageSourceListing {
  return {
    title: 'List seed',
    description: null,
    addressRaw: null,
    city: CONFIG.city,
    state: CONFIG.state,
    sourceUrl,
    imageSourceUrl: null,
    rawPayload: { coverageMissingIngest: true },
  }
}

describe('YSTM detail URL policy alignment', () => {
  const shortPathHtml = readFileSync(
    join(process.cwd(), 'tests/fixtures/ystm/detail-with-native-coords.html'),
    'utf8'
  )

  it.each([
    ['2-segment userlisting', SHORT_USERLISTING],
    ['2-segment listing', SHORT_LISTING],
    ['2-segment userlisting ?s=tl', SHORT_USERLISTING_TL],
  ])('parseYstmDetailListingFromHtml accepts %s', (_label, sourceUrl) => {
    const merged = parseYstmDetailListingFromHtml({
      html: shortPathHtml,
      sourceUrl,
      config: CONFIG,
      listSeed: listSeed(sourceUrl),
    })
    expect(merged).not.toBeNull()
    expect(merged?.title).toBe('Detail title')
    expect(merged?.rawPayload).toMatchObject({ detailPageParsed: true })
  })

  it('still parses existing 6-segment URL', () => {
    const louisvilleHtml = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-louisville-devondale.html'),
      'utf8'
    )
    const config = { ...CONFIG, city: 'Louisville', state: 'KY' }
    const merged = parseYstmDetailListingFromHtml({
      html: louisvilleHtml,
      sourceUrl: LONG_USERLISTING,
      config,
      listSeed: listSeed(LONG_USERLISTING),
    })
    expect(merged?.title).toBe('Our Biggest Yard Sale')
  })

  it('rejects non-detail URLs via isYstmDetailListingUrl', () => {
    expect(isYstmDetailListingUrl('https://yardsaletreasuremap.com/US/Illinois/Chicago')).toBe(
      false
    )
    expect(
      parseYstmDetailListingFromHtml({
        html: '<html><body></body></html>',
        sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago',
        config: CONFIG,
        listSeed: listSeed('https://yardsaletreasuremap.com/US/Illinois/Chicago'),
      })
    ).toBeNull()
  })

  it('coverage audit and missing-ingest produce identical parse acceptance', () => {
    const louisvilleHtml = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-louisville-devondale.html'),
      'utf8'
    )
    const cases: Array<{ sourceUrl: string; html: string; city: string; state: string }> = [
      {
        sourceUrl: SHORT_USERLISTING,
        html: shortPathHtml,
        city: CONFIG.city,
        state: CONFIG.state,
      },
      {
        sourceUrl: SHORT_LISTING,
        html: shortPathHtml,
        city: CONFIG.city,
        state: CONFIG.state,
      },
      {
        sourceUrl: SHORT_USERLISTING_TL,
        html: shortPathHtml,
        city: CONFIG.city,
        state: CONFIG.state,
      },
      {
        sourceUrl: LONG_USERLISTING,
        html: louisvilleHtml,
        city: 'Louisville',
        state: 'KY',
      },
    ]

    for (const { sourceUrl, html, city, state } of cases) {
      const auditParsed = parseYstmDetailPageFromHtml({
        html,
        sourceUrl,
        configCity: city,
        configState: state,
      })
      const validity = classifyYstmDetailAsValidActive({ parsed: auditParsed, html })
      const ingestMerged = parseYstmDetailListingFromHtml({
        html,
        sourceUrl,
        config: { ...CONFIG, city, state },
        listSeed: listSeed(sourceUrl),
      })

      expect(auditParsed, sourceUrl).not.toBeNull()
      expect(validity.valid, sourceUrl).toBe(true)
      expect(ingestMerged, sourceUrl).not.toBeNull()
      expect(ingestMerged?.title, sourceUrl).toBe(auditParsed?.title)
    }
  })
})
