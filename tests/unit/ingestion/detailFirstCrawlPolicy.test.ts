import { describe, expect, it } from 'vitest'
import {
  parseYstmListRecrawlRefreshMaxPerPage,
  shouldDeferListSeedSoftDedupe,
  shouldRefreshYstmDetailOnListRecrawl,
} from '@/lib/ingestion/acquisition/detailFirstCrawlPolicy'

const YSTM_DETAIL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/100-A/1001/userlisting.html'

describe('detailFirstCrawlPolicy', () => {
  it('defers list-seed soft dedupe for YSTM detail listing URLs', () => {
    expect(shouldDeferListSeedSoftDedupe(YSTM_DETAIL)).toBe(true)
    expect(shouldDeferListSeedSoftDedupe('https://yardsaletreasuremap.com/US/Illinois/Chicago')).toBe(
      false
    )
  })

  it('refreshes active YSTM detail rows on list re-crawl instead of duplicate skip', () => {
    expect(
      shouldRefreshYstmDetailOnListRecrawl(YSTM_DETAIL, {
        status: 'ready',
        failure_reasons: [],
      })
    ).toBe(true)
    expect(
      shouldRefreshYstmDetailOnListRecrawl('https://example.com/x/listing.html', {
        status: 'ready',
        failure_reasons: [],
      })
    ).toBe(false)
    expect(
      shouldRefreshYstmDetailOnListRecrawl(YSTM_DETAIL, {
        status: 'expired',
        failure_reasons: ['sale_expired'],
      })
    ).toBe(false)
  })

  it('parses list re-crawl refresh cap per page from env', () => {
    expect(parseYstmListRecrawlRefreshMaxPerPage({})).toBe(32)
    expect(
      parseYstmListRecrawlRefreshMaxPerPage({
        INGESTION_YSTM_LIST_RECRAWL_REFRESH_MAX_PER_PAGE: '8',
      })
    ).toBe(8)
  })
})
