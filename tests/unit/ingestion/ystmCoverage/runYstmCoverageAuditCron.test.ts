import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAcquireLease = vi.hoisted(() => vi.fn())
const mockReleaseLease = vi.hoisted(() => vi.fn())
const mockFetchHtml = vi.hoisted(() => vi.fn())
const mockLoadPublishedIndex = vi.hoisted(() => vi.fn())
const mockUpsertObservations = vi.hoisted(() => vi.fn())
const mockAggregateObservations = vi.hoisted(() => vi.fn())
const mockLoadStaleness = vi.hoisted(() => vi.fn())
const mockInsertConfigEvents = vi.hoisted(() => vi.fn())
const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/ingestionOrchestrationLease', () => ({
  acquireIngestionOrchestrationLease: mockAcquireLease,
  releaseIngestionOrchestrationLease: mockReleaseLease,
}))

vi.mock('@/lib/ingestion/adapters/externalPageSafeFetch', () => ({
  fetchSafeExternalPageHtml: mockFetchHtml,
}))

vi.mock('@/lib/ingestion/ystmCoverage/loadYstmCoverageLootAuraMatchIndex', () => ({
  loadYstmCoverageLootAuraMatchIndex: mockLoadPublishedIndex,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore', () => ({
  aggregateYstmCoverageObservations: mockAggregateObservations,
  upsertYstmCoverageObservations: mockUpsertObservations,
  loadYstmCoverageConfigStalenessHoursByKey: mockLoadStaleness,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoverageAuditConfigEventsStore', () => ({
  insertYstmCoverageAuditConfigEvents: mockInsertConfigEvents,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: mockFromBase,
}))

vi.mock('@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode', () => ({
  fetchCoverageBootstrapEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/ingestion/ystmCoverage/runPostAuditCoverageReconcile', () => ({
  runPostAuditCoverageReconcile: vi.fn().mockResolvedValue({
    ran: false,
    missingIngest: null,
    catalogRepair: null,
  }),
}))

const PAGE_A = 'https://yardsaletreasuremap.com/US/Illinois/Springfield/page-a.html'
const PAGE_B = 'https://yardsaletreasuremap.com/US/Illinois/Springfield/page-b.html'
const LISTING_A = 'https://yardsaletreasuremap.com/US/Illinois/Springfield/100-main-st/9001/listing.html'
const LISTING_B = 'https://yardsaletreasuremap.com/US/Illinois/Springfield/200-oak-st/9002/listing.html'

const crawlableConfig = {
  city: 'Springfield',
  state: 'IL',
  source_platform: 'external_page_source',
  source_pages: [PAGE_A, PAGE_B],
  source_crawl_excluded_at: null,
  enabled: true,
}

function listHtmlFor(url: string): string {
  if (url === PAGE_A) {
    return `<a href="${LISTING_A}">Sale A</a>`
  }
  return `<a href="${LISTING_B}">Sale B</a>`
}

describe('runYstmCoverageAuditCron', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAcquireLease.mockReset()
    mockReleaseLease.mockReset()
    mockFetchHtml.mockReset()
    mockLoadPublishedIndex.mockReset()
    mockUpsertObservations.mockReset()
    mockAggregateObservations.mockReset()
    mockLoadStaleness.mockReset()
    mockInsertConfigEvents.mockReset()
    mockFromBase.mockReset()

    mockAcquireLease.mockResolvedValue({
      acquired: true,
      owner: 'owner-1',
      staleRecovered: false,
      cursor: 0,
    })
    mockReleaseLease.mockResolvedValue(undefined)
    mockLoadPublishedIndex.mockResolvedValue({
      publishedActiveTotal: 0,
      visibleCanonicalUrls: new Set<string>(),
      visibleByCanonicalUrl: new Map(),
      visibleAliasByCanonical: new Map(),
      bySaleInstanceKey: new Map(),
      bySourceListingId: new Map(),
      byNormalizedAddress: new Map(),
    })
    mockLoadStaleness.mockResolvedValue({})
    mockInsertConfigEvents.mockResolvedValue(undefined)
    mockUpsertObservations.mockResolvedValue(undefined)
    mockAggregateObservations.mockResolvedValue({
      validActiveYstmUrls: 0,
      publishedVisibleInAudit: 0,
      missingValidYstmUrls: 0,
      observationCount: 2,
      missingByState: {},
      missingByMetro: {},
    })
    mockFetchHtml.mockImplementation(async (pageUrl: string) => listHtmlFor(pageUrl))

    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ingestion_city_configs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [crawlableConfig],
                  error: null,
                }),
            }),
          }),
        }
      }
      if (table === 'ystm_coverage_audit_runs') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'run-1' }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }
      }
      if (table === 'ystm_coverage_audit_config_events') {
        return {
          insert: () => Promise.resolve({ error: null }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it('fetches every source page on a config until list fetch budget is reached', async () => {
    const { runYstmCoverageAuditCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmCoverageAuditCron'
    )

    const result = await runYstmCoverageAuditCron({} as never, {
      budgets: {
        maxConfigsPerRun: 1,
        maxListFetchesPerRun: 10,
        maxDetailValidationsPerRun: 0,
        maxUrlsPerListPage: 50,
        leaseSeconds: 300,
        maxRuntimeMs: 240_000,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.telemetry.listPagesFetched).toBe(2)
    expect(result.telemetry.listingUrlsDiscovered).toBe(2)
    expect(mockFetchHtml).toHaveBeenCalledTimes(2)
    expect(mockFetchHtml).toHaveBeenNthCalledWith(
      1,
      PAGE_A,
      expect.objectContaining({ pageIndex: 0, adapter: 'ystm_coverage_audit' })
    )
    expect(mockFetchHtml).toHaveBeenNthCalledWith(
      2,
      PAGE_B,
      expect.objectContaining({ pageIndex: 1, adapter: 'ystm_coverage_audit' })
    )
  })

  it('dedupes canonical URLs across source pages before observation upsert', async () => {
    mockFetchHtml.mockImplementation(async (pageUrl: string) => {
      return `<a href="${LISTING_A}">Sale A</a>`
    })

    const { runYstmCoverageAuditCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmCoverageAuditCron'
    )

    const result = await runYstmCoverageAuditCron({} as never, {
      budgets: {
        maxConfigsPerRun: 1,
        maxListFetchesPerRun: 10,
        maxDetailValidationsPerRun: 0,
        maxUrlsPerListPage: 50,
        leaseSeconds: 300,
        maxRuntimeMs: 240_000,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.telemetry.listingUrlsDiscovered).toBe(2)
    expect(mockUpsertObservations).toHaveBeenCalledTimes(1)
    const listUpsertRows = mockUpsertObservations.mock.calls[0]![1] as Array<{ canonicalUrl: string }>
    expect(listUpsertRows).toHaveLength(1)
    expect(listUpsertRows[0]!.canonicalUrl).toContain('listing.html')
  })

  it('uses tiered selection mode and emits per-config events when tiered scheduler is enabled', async () => {
    const phoenixConfig = {
      id: '8ec56a41-4c4c-4de2-942e-480495467baa',
      city: 'Phoenix',
      state: 'AZ',
      source_platform: 'external_page_source',
      source_pages: ['https://yardsaletreasuremap.com/US/Arizona/Phoenix.html'],
      source_crawl_excluded_at: null,
      enabled: true,
    }

    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ingestion_city_configs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [phoenixConfig],
                  error: null,
                }),
            }),
          }),
        }
      }
      if (table === 'ystm_coverage_audit_runs') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'run-1' }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }
      }
      if (table === 'ystm_coverage_audit_config_events') {
        return {
          insert: () => Promise.resolve({ error: null }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    mockFetchHtml.mockResolvedValue(`<a href="${LISTING_A}">Sale A</a>`)
    mockLoadStaleness.mockResolvedValue({})

    const { runYstmCoverageAuditCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmCoverageAuditCron'
    )

    const result = await runYstmCoverageAuditCron({} as never, {
      tieredSchedulerEnabled: true,
      budgets: {
        maxConfigsPerRun: 2,
        maxListFetchesPerRun: 10,
        maxDetailValidationsPerRun: 0,
        maxUrlsPerListPage: 50,
        leaseSeconds: 300,
        maxRuntimeMs: 240_000,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.telemetry.auditSelectionMode).toBe('tiered')
    expect(result.telemetry.tier1Scheduled).toBe(1)
    expect(mockInsertConfigEvents).toHaveBeenCalledTimes(1)
    const events = mockInsertConfigEvents.mock.calls[0]![1] as Array<{ tier: number; outcome: string }>
    expect(events[0]!.tier).toBe(1)
    expect(events[0]!.outcome).toBe('ok_with_observations')
    expect(mockReleaseLease).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        updateLegacyCursor: false,
        nextLongTailCursor: 0,
      })
    )
  })
})
