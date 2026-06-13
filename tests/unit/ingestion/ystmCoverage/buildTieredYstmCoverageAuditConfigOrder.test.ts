import { describe, expect, it } from 'vitest'
import {
  buildTieredYstmCoverageAuditConfigOrder,
  computeTier1ReserveMax,
  isYstmStrategicConfigStale,
} from '@/lib/ingestion/ystmCoverage/buildTieredYstmCoverageAuditConfigOrder'
import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import type { ResolvedYstmStrategicMetro } from '@/lib/ingestion/ystmCoverage/resolveYstmStrategicMetroRegistry'

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

describe('computeTier1ReserveMax', () => {
  it('caps reserve at half the run budget and stale count', () => {
    expect(computeTier1ReserveMax(39, 80)).toBe(39)
    expect(computeTier1ReserveMax(5, 80)).toBe(5)
    expect(computeTier1ReserveMax(20, 40)).toBe(20)
    expect(computeTier1ReserveMax(0, 80)).toBe(0)
  })
})

describe('isYstmStrategicConfigStale', () => {
  it('treats never-observed configs as stale', () => {
    expect(
      isYstmStrategicConfigStale({
        config: config({ city: 'Phoenix', state: 'AZ' }),
        configStalenessHoursByKey: {},
        refreshTargetHours: 24,
      })
    ).toBe(true)
  })

  it('treats fresh configs as not stale', () => {
    expect(
      isYstmStrategicConfigStale({
        config: config({ city: 'Dallas', state: 'TX' }),
        configStalenessHoursByKey: { 'TX|Dallas': 2 },
        refreshTargetHours: 24,
      })
    ).toBe(false)
  })
})

describe('buildTieredYstmCoverageAuditConfigOrder', () => {
  it('schedules stale Tier 1 metros before Tier 2 and excludes principals from long-tail', () => {
    const phoenix = config({
      id: '8ec56a41-4c4c-4de2-942e-480495467baa',
      city: 'Phoenix',
      state: 'AZ',
      source_pages: ['https://yardsaletreasuremap.com/US/Arizona/Phoenix.html'],
    })
    const dallas = config({
      id: '736117c8-f15f-4026-b076-d4da13666493',
      city: 'Dallas',
      state: 'TX',
      source_pages: ['https://yardsaletreasuremap.com/US/Texas/Dallas.html'],
    })
    const suburb = config({ city: 'Alpha', state: 'IL' })
    const beta = config({ city: 'Beta', state: 'IL' })

    const resolvedStrategic: ResolvedYstmStrategicMetro[] = [
      {
        entry: {
          slug: 'phoenix-az',
          configId: phoenix.id!,
          city: 'Phoenix',
          state: 'AZ',
          principalPageUrl: 'https://yardsaletreasuremap.com/US/Arizona/Phoenix.html',
          refreshTargetHours: 24,
        },
        config: phoenix,
      },
      {
        entry: {
          slug: 'dallas-tx',
          configId: dallas.id!,
          city: 'Dallas',
          state: 'TX',
          principalPageUrl: 'https://yardsaletreasuremap.com/US/Texas/Dallas.html',
          refreshTargetHours: 24,
        },
        config: dallas,
      },
    ]

    const result = buildTieredYstmCoverageAuditConfigOrder({
      crawlableConfigs: [phoenix, dallas, suburb, beta],
      resolvedStrategic,
      configStalenessHoursByKey: {
        'AZ|Phoenix': 100,
        'TX|Dallas': 2,
      },
      longTailCursorBefore: 0,
      maxConfigsPerRun: 4,
    })

    expect(result.selectionMode).toBe('tiered')
    expect(result.tier1Scheduled).toBe(1)
    expect(result.tier2Scheduled).toBe(2)
    expect(result.slots[0]!.config.city).toBe('Phoenix')
    expect(result.slots[0]!.tier).toBe(1)
    expect(result.slots.slice(1).every((slot) => slot.tier === 2)).toBe(true)
    expect(result.slots.some((slot) => slot.config.city === 'Dallas')).toBe(false)
    expect(result.longTailCursorAfter).toBe(0)
  })

  it('consumes no Tier 1 slots when all strategic metros are fresh', () => {
    const dallas = config({
      id: '736117c8-f15f-4026-b076-d4da13666493',
      city: 'Dallas',
      state: 'TX',
    })
    const suburb = config({ city: 'Alpha', state: 'IL' })

    const result = buildTieredYstmCoverageAuditConfigOrder({
      crawlableConfigs: [dallas, suburb],
      resolvedStrategic: [
        {
          entry: {
            slug: 'dallas-tx',
            configId: dallas.id!,
            city: 'Dallas',
            state: 'TX',
            principalPageUrl: 'https://yardsaletreasuremap.com/US/Texas/Dallas.html',
            refreshTargetHours: 24,
          },
          config: dallas,
        },
      ],
      configStalenessHoursByKey: { 'TX|Dallas': 1 },
      longTailCursorBefore: 0,
      maxConfigsPerRun: 3,
    })

    expect(result.tier1Scheduled).toBe(0)
    expect(result.tier2Scheduled).toBe(1)
    expect(result.slots[0]!.config.city).toBe('Alpha')
  })
})
