import { describe, expect, it } from 'vitest'
import {
  classifyYstmDetailAsValidActive,
  computeCoveragePct,
  htmlSuggestsYstmListingRemoved,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import type { YstmDetailPageParsed } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'

function baseParsed(overrides: Partial<YstmDetailPageParsed> = {}): YstmDetailPageParsed {
  return {
    title: 'Big yard sale',
    description: 'Lots of furniture and tools for sale this weekend.',
    addressRaw: '123 Main St, Springfield, IL',
    addressSource: 'detail_page',
    startDate: '2099-06-01',
    endDate: '2099-06-02',
    city: 'Springfield',
    state: 'IL',
    imageUrls: [],
    nativeCoords: null,
    cityConflict: false,
    ...overrides,
  }
}

describe('ystmCoverageValidity', () => {
  it('accepts active listing with title, dates, and visible content', () => {
    expect(classifyYstmDetailAsValidActive({ parsed: baseParsed() })).toEqual({ valid: true })
  })

  it('rejects expired sale windows', () => {
    const result = classifyYstmDetailAsValidActive({
      parsed: baseParsed({ startDate: '2020-01-01', endDate: '2020-01-02' }),
    })
    expect(result).toEqual({ valid: false, reason: 'expired' })
  })

  it('rejects gated-only pages without visible content', () => {
    const result = classifyYstmDetailAsValidActive({
      parsed: baseParsed({
        addressRaw: null,
        addressSource: null,
        description: null,
        nativeCoords: null,
      }),
    })
    expect(result.valid).toBe(false)
  })

  it('detects removed listing HTML', () => {
    expect(htmlSuggestsYstmListingRemoved('<html><body>Page not found</body></html>')).toBe(true)
  })

  it('computes coverage percent with two decimal places', () => {
    expect(
      computeCoveragePct({ validActiveYstmUrls: 200, publishedVisibleInAudit: 180 })
    ).toBe(90)
    expect(computeCoveragePct({ validActiveYstmUrls: 0, publishedVisibleInAudit: 0 })).toBeNull()
  })
})
