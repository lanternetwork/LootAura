import { describe, expect, it } from 'vitest'
import { resolveYstmStrategicMetroRegistry } from '@/lib/ingestion/ystmCoverage/resolveYstmStrategicMetroRegistry'
import { YSTM_STRATEGIC_METRO_REGISTRY_V1 } from '@/lib/ingestion/ystmCoverage/ystmStrategicMetroRegistryV1'
import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'

function config(input: Partial<ExternalCityConfigRow> & Pick<ExternalCityConfigRow, 'city' | 'state'>): ExternalCityConfigRow {
  return {
    id: input.id,
    city: input.city,
    state: input.state,
    source_platform: 'external_page_source',
    source_pages: input.source_pages ?? ['https://example.com/list.html'],
    source_crawl_excluded_at: null,
  }
}

describe('resolveYstmStrategicMetroRegistry', () => {
  it('resolves registry entries by config_id with runtime city/state/page validation', () => {
    const chicago = config({
      id: 'df49b588-4711-4518-a26c-f5c4d38786e4',
      city: 'Chicago',
      state: 'IL',
      source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Chicago.html'],
    })

    const { resolved } = resolveYstmStrategicMetroRegistry({
      crawlableConfigs: [chicago],
    })

    expect(resolved.some((item) => item.entry.slug === 'chicago-il')).toBe(true)
  })

  it('excludes malformed Chicago.html configs', () => {
    const malformed = config({
      id: 'e51e56b2-0000-0000-0000-000000000001',
      city: 'Chicago.html',
      state: 'IL',
      source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Chicago.html'],
    })

    const { resolved } = resolveYstmStrategicMetroRegistry({
      crawlableConfigs: [malformed],
    })

    expect(resolved.some((item) => item.entry.slug === 'chicago-il')).toBe(false)
  })

  it('does not include Denver in the approved registry constant', () => {
    expect(YSTM_STRATEGIC_METRO_REGISTRY_V1.some((entry) => entry.slug === 'denver-co')).toBe(false)
    expect(YSTM_STRATEGIC_METRO_REGISTRY_V1).toHaveLength(39)
  })
})
