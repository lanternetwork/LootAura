import { describe, expect, it } from 'vitest'
import { shouldDeferListSeedSoftDedupe } from '@/lib/ingestion/acquisition/detailFirstCrawlPolicy'

describe('detailFirstCrawlPolicy', () => {
  it('defers list-seed soft dedupe for YSTM detail listing URLs', () => {
    expect(
      shouldDeferListSeedSoftDedupe(
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/100-A/1001/userlisting.html'
      )
    ).toBe(true)
    expect(shouldDeferListSeedSoftDedupe('https://yardsaletreasuremap.com/US/Illinois/Chicago')).toBe(
      false
    )
  })
})
