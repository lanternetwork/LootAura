import { describe, expect, it } from 'vitest'
import { isEligibleForExistingUrlRefresh } from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshCandidates'

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

describe('isEligibleForExistingUrlRefresh', () => {
  const nowMs = Date.parse('2026-05-18T12:00:00.000Z')

  it('requires YSTM detail listing URL', () => {
    expect(
      isEligibleForExistingUrlRefresh(
        { sourceUrl: 'https://example.com/page', lastSourceSyncAt: null },
        nowMs,
        12
      )
    ).toBe(false)
  })

  it('allows refresh when never synced', () => {
    expect(
      isEligibleForExistingUrlRefresh(
        { sourceUrl: DETAIL_URL, lastSourceSyncAt: null },
        nowMs,
        12
      )
    ).toBe(true)
  })

  it('skips recently synced rows', () => {
    expect(
      isEligibleForExistingUrlRefresh(
        {
          sourceUrl: DETAIL_URL,
          lastSourceSyncAt: '2026-05-18T10:00:00.000Z',
        },
        nowMs,
        12
      )
    ).toBe(false)
  })

  it('allows refresh after stale threshold', () => {
    expect(
      isEligibleForExistingUrlRefresh(
        {
          sourceUrl: DETAIL_URL,
          lastSourceSyncAt: '2026-05-17T20:00:00.000Z',
        },
        nowMs,
        12
      )
    ).toBe(true)
  })
})
