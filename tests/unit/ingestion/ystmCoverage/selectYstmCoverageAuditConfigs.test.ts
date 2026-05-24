import { describe, expect, it } from 'vitest'
import { buildYstmCoverageAuditConfigOrder } from '@/lib/ingestion/ystmCoverage/selectYstmCoverageAuditConfigs'
import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'

function config(city: string, state: string): ExternalCityConfigRow {
  return {
    city,
    state,
    source_platform: 'external_page_source',
    source_pages: ['https://example.com/list.html'],
    source_crawl_excluded_at: null,
  }
}

describe('buildYstmCoverageAuditConfigOrder', () => {
  it('uses round-robin ordering when bootstrap is off', () => {
    const configs = [config('Zebra', 'TX'), config('Alpha', 'IL')]
    const result = buildYstmCoverageAuditConfigOrder({
      crawlableConfigs: configs,
      observationAgg: { missingByMetro: {}, missingByState: {} },
      bootstrapEnabled: false,
      cursorBefore: 0,
    })
    expect(result.selectionMode).toBe('round_robin')
    expect(result.orderedConfigs[0]!.city).toBe('Alpha')
  })

  it('prioritizes metros with more missing valid URLs when bootstrap is on', () => {
    const configs = [config('Low', 'IL'), config('High', 'TX')]
    const result = buildYstmCoverageAuditConfigOrder({
      crawlableConfigs: configs,
      observationAgg: {
        missingByMetro: { 'High, TX': 50, 'Low, IL': 2 },
        missingByState: { TX: 50, IL: 2 },
      },
      bootstrapEnabled: true,
      cursorBefore: 0,
    })
    expect(result.selectionMode).toBe('metro_priority')
    expect(result.orderedConfigs[0]!.city).toBe('High')
  })
})
