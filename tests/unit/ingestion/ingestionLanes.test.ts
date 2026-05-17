import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  ALL_INGESTION_LANE_KEYS,
  configMatchesLane,
  filterConfigsForLane,
  isIngestionLaneModeEnabled,
  laneDefinitionForKey,
  legacyIngestionLaneContext,
  parseIngestionLaneKey,
  parseIngestionLaneRotationList,
  regionLaneForState,
  resolveIngestionLaneFromParam,
} from '@/lib/ingestion/ingestionLanes'
import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'

describe('ingestionLanes', () => {
  const envBackup = { ...process.env }

  afterEach(() => {
    process.env = { ...envBackup }
  })

  it('maps US states to regions deterministically', () => {
    expect(regionLaneForState('CA')).toBe('region:west')
    expect(regionLaneForState('NY')).toBe('region:northeast')
    expect(regionLaneForState('TX')).toBe('region:southwest')
    expect(regionLaneForState('IL')).toBe('region:midwest')
    expect(regionLaneForState('FL')).toBe('region:southeast')
    expect(regionLaneForState('XX')).toBeNull()
  })

  it('global lane includes all crawlable configs; region lane filters by state', () => {
    const rows: ExternalCityConfigRow[] = [
      { city: 'a', state: 'CA', source_platform: 'external_page_source', source_pages: ['https://a.com'] },
      { city: 'b', state: 'NY', source_platform: 'external_page_source', source_pages: ['https://b.com'] },
    ]
    const globalLane = laneDefinitionForKey('global')
    const westLane = laneDefinitionForKey('region:west')
    expect(filterConfigsForLane(rows, globalLane)).toHaveLength(2)
    expect(filterConfigsForLane(rows, westLane)).toHaveLength(1)
    expect(filterConfigsForLane(rows, westLane)[0]?.state).toBe('CA')
  })

  it('uses distinct state keys per lane', () => {
    expect(laneDefinitionForKey('global').stateKey).toBe('external_page_source:global')
    expect(laneDefinitionForKey('region:midwest').stateKey).toBe('external_page_source:region:midwest')
  })

  it('rejects invalid lane keys', () => {
    expect(parseIngestionLaneKey('lane:recovery')).toBeNull()
    expect(resolveIngestionLaneFromParam('bogus')).toEqual({ ok: false, error: 'invalid_lane' })
  })

  it('legacy context when lane mode disabled', () => {
    delete process.env.INGESTION_LANE_MODE
    expect(isIngestionLaneModeEnabled()).toBe(false)
    const ctx = legacyIngestionLaneContext()
    expect(ctx.lane.stateKey).toBe('external_page_source')
    expect(ctx.laneModeEnabled).toBe(false)
  })

  it('parses rotation list from env', () => {
    process.env.INGESTION_LANE_ROTATION = 'global,region:west,region:midwest'
    expect(parseIngestionLaneRotationList()).toEqual(['global', 'region:west', 'region:midwest'])
  })

  it('configMatchesLane for global always true', () => {
    const row: ExternalCityConfigRow = {
      city: 'x',
      state: 'ZZ',
      source_platform: 'external_page_source',
      source_pages: [],
    }
    expect(configMatchesLane(row, laneDefinitionForKey('global'))).toBe(true)
  })

  it('includes all v1 lane keys', () => {
    expect(ALL_INGESTION_LANE_KEYS).toContain('global')
    expect(ALL_INGESTION_LANE_KEYS).toHaveLength(6)
  })
})
