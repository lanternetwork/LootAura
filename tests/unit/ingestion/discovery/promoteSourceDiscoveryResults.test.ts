import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValidatedDiscoveryCandidate } from '@/lib/ingestion/discovery/sourceDiscovery'
import {
  isMalformedIngestionCityName,
  promoteSourceDiscoveryResults,
  type IngestionCityConfigDiscoveryRow,
} from '@/lib/ingestion/discovery/promoteSourceDiscoveryResults'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'

const emitMock = vi.fn()

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
  emitObservabilityRecord: (record: unknown) => emitMock(record),
  shouldEmitTelemetryJson: () => false,
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

type Store = {
  rows: IngestionCityConfigDiscoveryRow[]
  inserts: Record<string, unknown>[]
  updates: Array<{ id: string; patch: Record<string, unknown> }>
}

function candidate(
  partial: Partial<ValidatedDiscoveryCandidate> & Pick<ValidatedDiscoveryCandidate, 'city' | 'state' | 'canonicalUrl'>
): ValidatedDiscoveryCandidate {
  return {
    statePathSegment: partial.state === 'IN' ? 'Indiana' : 'Illinois',
    cityPathSegment: `${partial.city}.html`,
    sharedHubPage: partial.sharedHubPage ?? false,
    validation: partial.validation ?? { ok: true, kind: 'valid_city_page' },
    ...partial,
  }
}

function createStore(initial: IngestionCityConfigDiscoveryRow[]): Store {
  return { rows: initial.map((r) => ({ ...r })), inserts: [], updates: [] }
}

function createTableApi(store: Store) {
  const filters: Array<(row: IngestionCityConfigDiscoveryRow) => boolean> = []

  const selectChain = {
    select: () => selectChain,
    eq: (col: string, val: unknown) => {
      filters.push((row) => (row as Record<string, unknown>)[col] === val)
      return selectChain
    },
    in: (col: string, vals: string[]) => {
      filters.push((row) => vals.includes(String((row as Record<string, unknown>)[col])))
      return selectChain
    },
    then: (resolve: (v: { data: unknown; error: null }) => void) => {
      const data = store.rows.filter((row) => filters.every((f) => f(row)))
      resolve({ data, error: null })
    },
  }

  return {
    select: () => selectChain,
    insert: (payload: Record<string, unknown>) => {
      store.inserts.push(payload)
      const row: IngestionCityConfigDiscoveryRow = {
        id: `ins-${store.rows.length + 1}`,
        city: String(payload.city),
        state: String(payload.state),
        timezone: String(payload.timezone),
        enabled: Boolean(payload.enabled),
        source_platform: String(payload.source_platform),
        source_pages: payload.source_pages,
        source_discovery_status: payload.source_discovery_status as IngestionCityConfigDiscoveryRow['source_discovery_status'],
        source_last_discovered_at: (payload.source_last_discovered_at as string) ?? null,
        source_last_validated_at: (payload.source_last_validated_at as string) ?? null,
        source_last_failed_at: (payload.source_last_failed_at as string) ?? null,
        source_discovery_failure_reason: (payload.source_discovery_failure_reason as string) ?? null,
      }
      store.rows.push(row)
      const result = { data: { id: row.id }, error: null as null }
      const insertChain = {
        select: () => insertChain,
        single: () => Promise.resolve(result),
      }
      return insertChain
    },
    update: (patch: Record<string, unknown>) => ({
      eq: (col: string, val: unknown) => {
        const match = store.rows.find((row) => (row as Record<string, unknown>)[col] === val)
        if (match) {
          store.updates.push({ id: match.id, patch })
          Object.assign(match, patch)
        }
        return Promise.resolve({ error: null })
      },
    }),
  }
}

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: (_admin: unknown, table: string) => {
    if (table !== 'ingestion_city_configs') throw new Error(`unexpected table ${table}`)
    return createTableApi(currentStore)
  },
}))

let currentStore: Store

describe('promoteSourceDiscoveryResults', () => {
  beforeEach(() => {
    emitMock.mockClear()
    currentStore = createStore([])
  })

  it('populates empty pending placeholder', async () => {
    currentStore = createStore([
      {
        id: '1',
        city: 'Oak Lawn',
        state: 'IL',
        timezone: 'America/Chicago',
        enabled: true,
        source_platform: 'external_page_source',
        source_pages: [],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
        source_last_discovered_at: null,
        source_last_validated_at: null,
        source_last_failed_at: null,
        source_discovery_failure_reason: null,
      },
    ])

    const result = await promoteSourceDiscoveryResults({} as never, {
      candidates: [
        candidate({
          city: 'Oak Lawn',
          state: 'IL',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn.html',
        }),
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.telemetry.configsPromoted).toBe(1)
    expect(currentStore.rows[0]?.source_pages).toEqual([
      'https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn.html',
    ])
    expect(currentStore.rows[0]?.source_discovery_status).toBe(SOURCE_DISCOVERY_STATUS.validated)
    expect(currentStore.rows[0]?.timezone).toBe('America/Chicago')
  })

  it('skips manual configs', async () => {
    currentStore = createStore([
      {
        id: 'm1',
        city: 'Oak Park',
        state: 'IL',
        timezone: 'America/Chicago',
        enabled: true,
        source_platform: 'external_page_source',
        source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Chicago.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.manual,
        source_last_discovered_at: null,
        source_last_validated_at: null,
        source_last_failed_at: null,
        source_discovery_failure_reason: null,
      },
    ])

    const result = await promoteSourceDiscoveryResults({} as never, {
      candidates: [
        candidate({
          city: 'Oak Park',
          state: 'IL',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago.html',
          sharedHubPage: true,
        }),
      ],
    })

    expect(result.telemetry.manualConfigsSkipped).toBe(1)
    expect(currentStore.rows[0]?.source_pages).toEqual([
      'https://yardsaletreasuremap.com/US/Illinois/Chicago.html',
    ])
  })

  it('allows shared hub mapping for new municipality rows', async () => {
    const result = await promoteSourceDiscoveryResults({} as never, {
      candidates: [
        candidate({
          city: 'Evergreen Park',
          state: 'IL',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago.html',
          sharedHubPage: true,
        }),
      ],
    })

    expect(result.telemetry.sharedHubMappingsCreated).toBe(1)
    expect(result.telemetry.inserts).toBe(1)
    expect(currentStore.rows[0]).toMatchObject({
      city: 'Evergreen Park',
      state: 'IL',
      source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Chicago.html'],
    })
    expect(currentStore.rows[0]?.city).not.toMatch(/\.html/i)
  })

  it('normalizes malformed city names on update', async () => {
    currentStore = createStore([
      {
        id: 'bad',
        city: 'Chicago.html',
        state: 'IL',
        timezone: 'America/Chicago',
        enabled: true,
        source_platform: 'external_page_source',
        source_pages: [],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
        source_last_discovered_at: null,
        source_last_validated_at: null,
        source_last_failed_at: null,
        source_discovery_failure_reason: null,
      },
    ])

    const result = await promoteSourceDiscoveryResults({} as never, {
      candidates: [
        candidate({
          city: 'Chicago',
          state: 'IL',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago.html',
          sharedHubPage: true,
        }),
      ],
    })

    expect(result.telemetry.malformedCityNamesNormalized).toBe(1)
    expect(currentStore.rows[0]?.city).toBe('Chicago')
  })

  it('repairs invalid http-only source_pages on pending rows', async () => {
    currentStore = createStore([
      {
        id: 'p1',
        city: 'Munster',
        state: 'IN',
        timezone: 'America/Indiana/Indianapolis',
        enabled: true,
        source_platform: 'external_page_source',
        source_pages: ['http://insecure.example/page.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
        source_last_discovered_at: null,
        source_last_validated_at: null,
        source_last_failed_at: null,
        source_discovery_failure_reason: null,
      },
    ])

    const result = await promoteSourceDiscoveryResults({} as never, {
      candidates: [
        candidate({
          city: 'Munster',
          state: 'IN',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Indiana/Munster.html',
        }),
      ],
    })

    expect(result.telemetry.configsRepaired).toBe(1)
    expect(currentStore.rows[0]?.source_pages).toEqual([
      'https://yardsaletreasuremap.com/US/Indiana/Munster.html',
    ])
  })

  it('skips failed validation candidates', async () => {
    const result = await promoteSourceDiscoveryResults({} as never, {
      candidates: [
        candidate({
          city: 'Alton',
          state: 'IL',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Alton.html',
          validation: { ok: false, reason: 'missing_city_page_markers' },
        }),
      ],
    })

    expect(result.telemetry.validationsFailed).toBe(1)
    expect(currentStore.rows).toHaveLength(0)
  })

  it('dry-run does not mutate store', async () => {
    currentStore = createStore([
      {
        id: '1',
        city: 'Oak Lawn',
        state: 'IL',
        timezone: 'America/Chicago',
        enabled: true,
        source_platform: 'external_page_source',
        source_pages: [],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
        source_last_discovered_at: null,
        source_last_validated_at: null,
        source_last_failed_at: null,
        source_discovery_failure_reason: null,
      },
    ])

    await promoteSourceDiscoveryResults({} as never, {
      dryRun: true,
      candidates: [
        candidate({
          city: 'Oak Lawn',
          state: 'IL',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn.html',
        }),
      ],
    })

    expect(currentStore.rows[0]?.source_pages).toEqual([])
    expect(currentStore.updates).toHaveLength(0)
  })

  it('fail closed when timezone cannot be resolved for new row', async () => {
    const result = await promoteSourceDiscoveryResults({} as never, {
      candidates: [
        candidate({
          city: 'Nowhere',
          state: 'ZZ',
          canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Nowhere.html',
        }),
      ],
    })

    expect(result.telemetry.timezoneUnresolved).toBe(1)
    expect(currentStore.rows).toHaveLength(0)
  })
})

describe('isMalformedIngestionCityName', () => {
  it('detects .html artifact cities', () => {
    expect(isMalformedIngestionCityName('Chicago.html')).toBe(true)
    expect(isMalformedIngestionCityName('Chicago')).toBe(false)
  })
})
