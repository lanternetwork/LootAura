import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectHubDrift,
  isPlaceholderAwaitingRemediation,
  revalidateYstmConfigs,
  validateConfigSourcePage,
  type RevalidateYstmConfigsResult,
} from '@/lib/ingestion/discovery/revalidateYstmConfigs'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import type { IngestionCityConfigDiscoveryRow } from '@/lib/ingestion/discovery/promoteYstmDiscoveryResults'

const emitMock = vi.fn()
const promoteMock = vi.fn()

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
  emitObservabilityRecord: (record: unknown) => emitMock(record),
  shouldEmitTelemetryJson: () => false,
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/ingestion/discovery/promoteYstmDiscoveryResults', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ingestion/discovery/promoteYstmDiscoveryResults')>()
  return {
    ...mod,
    promoteYstmDiscoveryResults: (...args: unknown[]) => promoteMock(...args),
  }
})

const FIXTURES = join(process.cwd(), 'tests/fixtures/ingestion/discovery')
const loadFixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

type Store = {
  rows: IngestionCityConfigDiscoveryRow[]
  updates: Array<{ id: string; patch: Record<string, unknown> }>
}

let currentStore: Store

function row(partial: Partial<IngestionCityConfigDiscoveryRow> & Pick<IngestionCityConfigDiscoveryRow, 'id' | 'city' | 'state'>): IngestionCityConfigDiscoveryRow {
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
    ...partial,
  }
}

function createTableApi(store: Store) {
  const filters: Array<(r: IngestionCityConfigDiscoveryRow) => boolean> = []
  const selectChain = {
    select: () => selectChain,
    eq: (col: string, val: unknown) => {
      filters.push((r) => (r as Record<string, unknown>)[col] === val)
      return selectChain
    },
    in: (col: string, vals: string[]) => {
      filters.push((r) => vals.includes(String((r as Record<string, unknown>)[col])))
      return selectChain
    },
    then: (resolve: (v: { data: unknown; error: null }) => void) => {
      resolve({ data: store.rows.filter((r) => filters.every((f) => f(r))), error: null })
    },
  }
  return {
    select: () => selectChain,
    update: (patch: Record<string, unknown>) => ({
      eq: (col: string, val: unknown) => {
        const match = store.rows.find((r) => (r as Record<string, unknown>)[col] === val)
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
    if (table !== 'ingestion_city_configs') throw new Error(table)
    return createTableApi(currentStore)
  },
}))

function fixtureFetch(url: string): string {
  const path = new URL(url).pathname
  if (path === '/US/Indiana/') return loadFixture('state_index_indiana_dir_snippet.html')
  if (path === '/US/Illinois/') return loadFixture('state_index_illinois_dir.html')
  if (path.endsWith('/Munster.html')) return loadFixture('city_page_with_listings.html')
  if (path.endsWith('/Chicago.html')) return loadFixture('city_page_chicago_hub.html')
  if (path.endsWith('/Oak-Lawn.html')) return loadFixture('city_page_with_listings.html')
  if (path.endsWith('/Alton.html')) return loadFixture('malformed_page.html')
  return loadFixture('malformed_page.html')
}

describe('detectHubDrift', () => {
  it('does not flag shared hub Chicago.html for suburb config', () => {
    expect(
      detectHubDrift(
        'Evergreen Park',
        'https://yardsaletreasuremap.com/US/Illinois/Chicago.html'
      )
    ).toBe(false)
  })

  it('flags non-hub slug mismatch', () => {
    expect(
      detectHubDrift(
        'Oak Lawn',
        'https://yardsaletreasuremap.com/US/Illinois/Burbank.html'
      )
    ).toBe(true)
  })
})

describe('validateConfigSourcePage', () => {
  it('validates crawlable city page fixture', async () => {
    const result = await validateConfigSourcePage(
      row({
        id: '1',
        city: 'Munster',
        state: 'IN',
        source_pages: ['https://yardsaletreasuremap.com/US/Indiana/Munster.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
      }),
      async (url) => fixtureFetch(url),
      0
    )
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.validation.ok).toBe(true)
  })
})

describe('revalidateYstmConfigs', () => {
  beforeEach(() => {
    emitMock.mockClear()
    promoteMock.mockReset()
    promoteMock.mockResolvedValue({
      ok: true,
      dryRun: false,
      records: [],
      telemetry: { configsPromoted: 1, configsRepaired: 0, inserts: 0, updates: 1, skipped: 0 },
    })
    currentStore = { rows: [], updates: [] }
  })

  it('revalidates healthy validated config timestamps', async () => {
    currentStore.rows = [
      row({
        id: 'ok',
        city: 'Munster',
        state: 'IN',
        source_pages: ['https://yardsaletreasuremap.com/US/Indiana/Munster.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
      }),
    ]

    const result = await revalidateYstmConfigs({} as never, {
      states: ['IN'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.telemetry.configsRevalidated).toBe(1)
    expect(currentStore.rows[0]?.source_last_validated_at).toBeTruthy()
    expect(result.records[0]?.action).toBe('validated')
  })

  it('does not mutate manual configs', async () => {
    const manualUrl = 'https://yardsaletreasuremap.com/US/Illinois/Chicago.html'
    currentStore.rows = [
      row({
        id: 'manual',
        city: 'Oak Park',
        state: 'IL',
        source_pages: [manualUrl],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.manual,
      }),
    ]

    const before = JSON.stringify(currentStore.rows[0])
    const result = await revalidateYstmConfigs({} as never, {
      states: ['IL'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.telemetry.manualRowsSkipped).toBe(1)
    expect(JSON.stringify(currentStore.rows[0])).toBe(before)
    expect(currentStore.updates).toHaveLength(0)
  })

  it('repairs stale URL via rediscovery', async () => {
    currentStore.rows = [
      row({
        id: 'stale',
        city: 'Munster',
        state: 'IN',
        source_pages: ['https://yardsaletreasuremap.com/US/Indiana/Alton.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
      }),
    ]

    const result = await revalidateYstmConfigs({} as never, {
      states: ['IN'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.telemetry.configsRediscovered).toBeGreaterThanOrEqual(1)
    expect(promoteMock).toHaveBeenCalled()
    expect(result.records.some((r) => r.action === 'repaired')).toBe(true)
  })

  it('marks failed when validation and rediscovery fail', async () => {
    currentStore.rows = [
      row({
        id: 'bad',
        city: 'Alton',
        state: 'IL',
        source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Alton.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
        source_last_discovered_at: '2026-05-01T00:00:00.000Z',
      }),
    ]

    const result = await revalidateYstmConfigs({} as never, {
      states: ['IL'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.telemetry.configsFailed).toBe(1)
    expect(currentStore.rows[0]?.source_discovery_status).toBe(SOURCE_DISCOVERY_STATUS.failed)
    expect(currentStore.rows[0]?.source_discovery_failure_reason).toBeTruthy()
  })

  it('populates empty placeholder via rediscovery', async () => {
    currentStore.rows = [
      row({
        id: 'empty',
        city: 'Munster',
        state: 'IN',
        source_pages: [],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
      }),
    ]

    const result = await revalidateYstmConfigs({} as never, {
      states: ['IN'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.telemetry.configsRepaired).toBeGreaterThanOrEqual(1)
    expect(promoteMock).toHaveBeenCalled()
  })

  it('normalizes malformed city name on repair', async () => {
    currentStore.rows = [
      row({
        id: 'malformed',
        city: 'Chicago.html',
        state: 'IL',
        source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Chicago.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
      }),
    ]

    await revalidateYstmConfigs({} as never, {
      states: ['IL'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(currentStore.rows[0]?.city).toBe('Chicago')
  })

  it('dry-run does not write updates', async () => {
    currentStore.rows = [
      row({
        id: 'dry',
        city: 'Munster',
        state: 'IN',
        source_pages: [],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
      }),
    ]

    await revalidateYstmConfigs({} as never, {
      dryRun: true,
      states: ['IN'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(currentStore.updates).toHaveLength(0)
  })

  it('emits aggregate telemetry without raw URLs', async () => {
    currentStore.rows = [
      row({
        id: 'tel',
        city: 'Munster',
        state: 'IN',
        source_pages: ['https://yardsaletreasuremap.com/US/Indiana/Munster.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
      }),
    ]

    await revalidateYstmConfigs({} as never, {
      states: ['IN'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    const serialized = JSON.stringify(emitMock.mock.calls)
    expect(serialized).toContain('source.discovery.revalidation_completed')
    expect(serialized).not.toContain('yardsaletreasuremap.com')
  })

  it('marks empty placeholder failed when rediscovery cannot validate', async () => {
    currentStore.rows = [
      row({
        id: 'ghost',
        city: 'Nowhereville',
        state: 'IN',
        source_pages: [],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.pending,
      }),
    ]

    const result = await revalidateYstmConfigs({} as never, {
      states: ['IN'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.telemetry.placeholdersUnresolved).toBe(1)
    expect(currentStore.rows[0]?.source_discovery_status).toBe(SOURCE_DISCOVERY_STATUS.failed)
    expect(currentStore.rows[0]?.source_last_failed_at).toBeTruthy()
    expect(promoteMock).not.toHaveBeenCalled()
  })

  it('does not create duplicate rows when repairing via promotion', async () => {
    currentStore.rows = [
      row({
        id: 'single',
        city: 'Munster',
        state: 'IN',
        source_pages: ['https://yardsaletreasuremap.com/US/Indiana/Alton.html'],
        source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
      }),
    ]

    await revalidateYstmConfigs({} as never, {
      states: ['IN'],
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(currentStore.rows).toHaveLength(1)
    expect(promoteMock).toHaveBeenCalledTimes(1)
  })
})

describe('isPlaceholderAwaitingRemediation', () => {
  it('identifies empty rows with discovery attempt', () => {
    expect(
      isPlaceholderAwaitingRemediation(
        row({
          id: 'p',
          city: 'X',
          state: 'IL',
          source_pages: [],
          source_last_discovered_at: '2026-05-01T00:00:00.000Z',
        })
      )
    ).toBe(true)
  })

  it('excludes manual rows', () => {
    expect(
      isPlaceholderAwaitingRemediation(
        row({
          id: 'm',
          city: 'X',
          state: 'IL',
          source_pages: [],
          source_discovery_status: SOURCE_DISCOVERY_STATUS.manual,
          source_last_discovered_at: '2026-05-01T00:00:00.000Z',
        })
      )
    ).toBe(false)
  })
})
