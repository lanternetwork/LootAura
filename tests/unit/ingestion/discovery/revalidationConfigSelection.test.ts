import { describe, expect, it } from 'vitest'
import { selectRevalidationConfigRows } from '@/lib/ingestion/discovery/revalidationConfigSelection'
import type { IngestionCityConfigDiscoveryRow } from '@/lib/ingestion/discovery/promoteSourceDiscoveryResults'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'

function config(
  partial: Partial<IngestionCityConfigDiscoveryRow> & Pick<IngestionCityConfigDiscoveryRow, 'id' | 'city' | 'state'>
): IngestionCityConfigDiscoveryRow {
  return {
    timezone: 'America/Chicago',
    enabled: true,
    source_platform: 'external_page_source',
    source_pages: [],
    source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
    source_last_discovered_at: null,
    source_last_validated_at: null,
    source_last_failed_at: null,
    source_discovery_failure_reason: null,
    source_crawl_excluded_at: null,
    ...partial,
  }
}

describe('selectRevalidationConfigRows', () => {
  it('prioritizes empty source_pages before configs with pages', () => {
    const rows = [
      config({
        id: '1',
        city: 'Zebra',
        state: 'IL',
        source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Zebra/Zebra.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
      }),
      config({ id: '2', city: 'Alpha', state: 'IL', source_pages: [] }),
    ]
    const selected = selectRevalidationConfigRows(rows, { max: 1, mode: 'balanced' })
    expect(selected).toHaveLength(1)
    expect(selected[0]?.id).toBe('2')
  })

  it('no_source_pages_only returns only empty page configs', () => {
    const rows = [
      config({
        id: '1',
        city: 'A',
        state: 'TX',
        source_pages: ['https://yardsaletreasuremap.com/US/Texas/A/A.html'],
      }),
      config({ id: '2', city: 'B', state: 'TX', source_pages: [] }),
    ]
    const selected = selectRevalidationConfigRows(rows, { max: 10, mode: 'no_source_pages_only' })
    expect(selected.map((r) => r.id)).toEqual(['2'])
  })

  it('skips disabled and manual configs', () => {
    const rows = [
      config({ id: '1', city: 'A', state: 'CA', source_pages: [], enabled: false }),
      config({
        id: '2',
        city: 'B',
        state: 'CA',
        source_pages: [],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.manual,
      }),
      config({ id: '3', city: 'C', state: 'CA', source_pages: [] }),
    ]
    const selected = selectRevalidationConfigRows(rows, { max: 10 })
    expect(selected.map((r) => r.id)).toEqual(['3'])
  })

  it('filters by state when provided', () => {
    const rows = [
      config({ id: '1', city: 'A', state: 'FL', source_pages: [] }),
      config({ id: '2', city: 'B', state: 'GA', source_pages: [] }),
    ]
    const selected = selectRevalidationConfigRows(rows, { max: 10, states: ['FL'] })
    expect(selected.map((r) => r.id)).toEqual(['1'])
  })
})
