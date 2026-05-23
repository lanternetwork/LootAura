import { describe, expect, it } from 'vitest'
import {
  mustClassifyViaYstmDetailFirstBeforeUrlSkip,
  parseYstmListRecrawlRefreshMaxPerPage,
  shouldDeferListSeedSoftDedupe,
  shouldQueueYstmListRecrawlRefresh,
  shouldRefreshYstmDetailOnListRecrawl,
} from '@/lib/ingestion/acquisition/detailFirstCrawlPolicy'

const YSTM_DETAIL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/100-A/1001/userlisting.html'

describe('detailFirstCrawlPolicy', () => {
  it('requires detail-first classification before URL-only skip for YSTM detail URLs', () => {
    expect(
      mustClassifyViaYstmDetailFirstBeforeUrlSkip(
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/100-A/1001/userlisting.html'
      )
    ).toBe(true)
    expect(mustClassifyViaYstmDetailFirstBeforeUrlSkip('https://example.com/city/list')).toBe(
      false
    )
  })

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

  it('queues priority URL-reuse refresh even when per-page cap is reached', () => {
    const existing = {
      id: 'ing-1',
      status: 'ready',
      failure_reasons: [],
      date_start: '2026-06-01',
      date_end: '2026-06-02',
      normalized_address: '123 main st',
    }
    const atCap = shouldQueueYstmListRecrawlRefresh({
      sourcePlatform: 'external_page_source',
      sourceUrl: YSTM_DETAIL,
      existing,
      listing: {
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        addressRaw: '123 Main St',
      },
      refreshesQueued: 32,
      maxPerPage: 32,
    })
    expect(atCap.queue).toBe(true)
    expect(atCap.priority).toBe(true)
    expect(atCap.urlReuseEvent).toBe('new_event_same_url')

    const routine = shouldQueueYstmListRecrawlRefresh({
      sourcePlatform: 'external_page_source',
      sourceUrl: YSTM_DETAIL,
      existing,
      listing: {
        startDate: '2026-06-02',
        endDate: '2026-06-03',
        addressRaw: '123 Main St',
      },
      refreshesQueued: 32,
      maxPerPage: 32,
    })
    expect(routine.queue).toBe(false)
    expect(routine.priority).toBe(false)

    const expiredPrior = shouldQueueYstmListRecrawlRefresh({
      sourcePlatform: 'external_page_source',
      sourceUrl: YSTM_DETAIL,
      existing: {
        id: 'ing-expired',
        status: 'expired',
        failure_reasons: ['sale_expired'],
        date_start: '2026-01-01',
        date_end: '2026-01-02',
        normalized_address: null,
      },
      listing: {
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        addressRaw: null,
      },
      refreshesQueued: 99,
      maxPerPage: 32,
    })
    expect(expiredPrior.queue).toBe(true)
    expect(expiredPrior.priority).toBe(true)
  })

  it('parses list re-crawl refresh cap per page from env', () => {
    expect(parseYstmListRecrawlRefreshMaxPerPage({} as unknown as NodeJS.ProcessEnv)).toBe(32)
    expect(
      parseYstmListRecrawlRefreshMaxPerPage({
        INGESTION_YSTM_LIST_RECRAWL_REFRESH_MAX_PER_PAGE: '8',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(8)
  })
})
