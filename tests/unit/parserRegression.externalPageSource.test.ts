import { describe, it, expect } from 'vitest'
import {
  parseExternalPageSourceHtml,
  type ParseExternalPageSourceResult,
} from '@/lib/ingestion/adapters/externalPageSource'
import {
  assertExternalPageFixtureMatches,
  classifyExternalPageSourceRegressionGap,
  classifyFixtureParseGap,
  ParserRegressionFailureKind,
  normalizeExternalPageParseResult,
  runExternalPageSourceFixture,
} from '@/lib/parserRegression'

describe('parser regression fixtures (external_page_source)', () => {
  it.each([
    ['external_page_source', 'chicago_slug_listing'],
    ['external_page_source', 'with_sorted_images'],
    ['craigslist', 'result_row_listing'],
    ['estate_sales_net', 'table_row_listing'],
    ['estate_sales_net', 'ngrx_metro_louisville'],
    ['facebook_external', 'og_and_shared_link'],
    ['external_page_source', 'empty_extraction_state_mismatch'],
    ['external_page_source', 'malformed_listing_href'],
    ['external_page_source', 'selector_drift_wrong_href_suffix'],
    ['external_page_source', 'unsupported_unknown_state'],
  ] as const)('matches golden snapshot for %s/%s', (source, caseId) => {
    assertExternalPageFixtureMatches(source, caseId)
  })
})

describe('parser regression taxonomy (external_page_source)', () => {
  it('classifies selector drift (wrong href suffix) as selector_missing', () => {
    expect(classifyFixtureParseGap('external_page_source', 'selector_drift_wrong_href_suffix')).toBe(
      ParserRegressionFailureKind.selector_missing
    )
  })

  it('classifies malformed shallow listing href as malformed_source_data', () => {
    expect(classifyFixtureParseGap('external_page_source', 'malformed_listing_href')).toBe(
      ParserRegressionFailureKind.malformed_source_data
    )
  })

  it('classifies state-filtered empty extraction as extraction_empty', () => {
    expect(classifyFixtureParseGap('external_page_source', 'empty_extraction_state_mismatch')).toBe(
      ParserRegressionFailureKind.extraction_empty
    )
  })

  it('classifies unknown list state config as unsupported_layout', () => {
    expect(classifyFixtureParseGap('external_page_source', 'unsupported_unknown_state')).toBe(
      ParserRegressionFailureKind.unsupported_layout
    )
  })

  it('throws when normalized snapshot cannot be JSON-serialized (normalization contract)', () => {
    const bad: ParseExternalPageSourceResult = {
      listings: [
        {
          title: 'x',
          description: null,
          addressRaw: null,
          city: 'Chicago',
          state: 'IL',
          sourceUrl: 'https://example.com/list',
          imageSourceUrl: null,
          rawPayload: {
            adapter: 'external_page_source',
            externalId: BigInt(1) as unknown as string,
          },
        },
      ],
      invalid: 0,
    }
    expect(() => JSON.stringify(normalizeExternalPageParseResult(bad))).toThrow()
  })
})

describe('parser regression normalization', () => {
  it('is idempotent under JSON round-trip for real parse output', async () => {
    const { parseExternalPageSourceHtml: parseHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `<a href="https://example.com/US/Illinois/Chicago/5-Oak/11/listing.html">T</a>`
    const parsed = parseHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      'https://example.com/list'
    )
    const once = normalizeExternalPageParseResult(parsed)
    const serialized = JSON.stringify(once)
    const again = JSON.stringify(JSON.parse(serialized) as Record<string, unknown>)
    expect(again).toBe(serialized)
  })

  it('orders multiple listings by sourceUrl', async () => {
    const { parseExternalPageSourceHtml: parseHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://example.com/US/Illinois/Chicago/2-B/20/listing.html">Second</a>
      <a href="https://example.com/US/Illinois/Chicago/1-A/10/listing.html">First</a>
    `
    const parsed = parseHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      'https://example.com/list'
    )
    const snap = normalizeExternalPageParseResult(parsed) as { listings: { sourceUrl: string }[] }
    expect(snap.listings.map((l) => l.sourceUrl)).toEqual([
      'https://example.com/US/Illinois/Chicago/1-A/10/listing.html',
      'https://example.com/US/Illinois/Chicago/2-B/20/listing.html',
    ])
  })
})

describe('parser regression harness smoke', () => {
  it('runExternalPageSourceFixture returns aligned actual vs expected shapes', () => {
    const { actual, expected } = runExternalPageSourceFixture('external_page_source', 'chicago_slug_listing')
    expect(typeof actual.parserAdapter).toBe('string')
    expect(typeof (expected as { parserAdapter?: string }).parserAdapter).toBe('string')
  })
})

describe('inline selector drift (no fixture file)', () => {
  it('detects missing listing.html anchors via regression gap classifier', () => {
    const html = `<a href="https://example.com/US/Illinois/Chicago/x/1/listing.htm">x</a>`
    const parsed = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      'https://example.com/list'
    )
    expect(
      classifyExternalPageSourceRegressionGap(html, parsed, { stateResolved: true })
    ).toBe(ParserRegressionFailureKind.selector_missing)
  })
})
