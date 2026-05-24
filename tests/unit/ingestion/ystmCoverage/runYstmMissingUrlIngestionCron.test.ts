import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAcquireLease = vi.hoisted(() => vi.fn())
const mockReleaseLease = vi.hoisted(() => vi.fn())
const mockFetchPage = vi.hoisted(() => vi.fn())
const mockLoadPublishedIndex = vi.hoisted(() => vi.fn())
const mockFindPublished = vi.hoisted(() => vi.fn())
const mockAttemptDetailFirst = vi.hoisted(() => vi.fn())
const mockRecordOutcome = vi.hoisted(() => vi.fn())
const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode', () => ({
  fetchCoverageBootstrapEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/ingestion/ingestionOrchestrationLease', () => ({
  acquireIngestionOrchestrationLease: mockAcquireLease,
  releaseIngestionOrchestrationLease: mockReleaseLease,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoverageMissingCandidates', () => ({
  fetchMissingIngestionCandidatePage: mockFetchPage,
  isEligibleForMissingIngestionRetry: vi.fn(() => true),
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex', () => ({
  loadLootAuraPublishedYstmIndex: mockLoadPublishedIndex,
}))

vi.mock('@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst', () => ({
  findPublishedIngestedSaleIdForDetailFirst: mockFindPublished,
}))

vi.mock('@/lib/ingestion/acquisition/ystmDetailFirstReady', () => ({
  attemptYstmDetailFirstReady: mockAttemptDetailFirst,
  emptyYstmDetailFirstRunMetrics: () => ({
    attempted: 0,
    succeeded: 0,
    published: 0,
    fallback: 0,
    fetchFailed: 0,
    rejectedByReason: {},
    msToPublishedSamples: [],
    addressValidatedFromDetailPage: 0,
    addressValidatedFromListSeed: 0,
    insertFailedByDbCode: {},
  }),
  mergeYstmDetailFirstMetrics: (target: { attempted: number }, delta: { attempted: number }) => {
    target.attempted += delta.attempted
  },
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore', () => ({
  recordYstmCoverageMissingIngestionOutcome: mockRecordOutcome,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: mockFromBase,
}))

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

describe('runYstmMissingUrlIngestionCron', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAcquireLease.mockReset()
    mockReleaseLease.mockReset()
    mockFetchPage.mockReset()
    mockLoadPublishedIndex.mockReset()
    mockFindPublished.mockReset()
    mockAttemptDetailFirst.mockReset()
    mockRecordOutcome.mockReset()
    mockFromBase.mockReset()

    mockAcquireLease.mockResolvedValue({
      acquired: true,
      owner: 'owner-1',
      staleRecovered: false,
      cursor: 0,
    })
    mockReleaseLease.mockResolvedValue(undefined)
    mockLoadPublishedIndex.mockResolvedValue({
      visibleCanonicalUrls: new Set<string>(),
      publishedActiveTotal: 0,
    })
    mockFindPublished.mockResolvedValue(null)
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        }
      }
      return {}
    })
    mockFetchPage.mockResolvedValue({
      candidates: [
        {
          canonicalUrl: DETAIL_URL,
          city: 'Louisville',
          state: 'KY',
          configKey: 'KY|Louisville',
          missingIngestionOutcome: null,
          missingIngestionAttemptedAt: null,
        },
      ],
      queueOffset: 0,
      queueTotal: 1,
      nextQueueOffset: 0,
    })
    mockAttemptDetailFirst.mockResolvedValue({
      result: { outcome: 'ready', ingestedSaleId: 'sale-1', published: true },
      metrics: { attempted: 1, published: 1, succeeded: 1, fallback: 0, fetchFailed: 0 },
    })
    mockRecordOutcome.mockResolvedValue(undefined)
  })

  it('skips when orchestration lease is active', async () => {
    mockAcquireLease.mockResolvedValue({
      acquired: false,
      owner: 'other',
      staleRecovered: false,
      cursor: 3,
      reason: 'active_lease',
    })
    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: {
        maxAttemptsPerRun: 5,
        maxCandidatesScannedPerRun: 10,
        failedRetryHours: 6,
        leaseSeconds: 300,
        maxRuntimeMs: 60_000,
      },
    })
    expect(result.telemetry.skipped).toBe(true)
    expect(result.telemetry.overlapPrevented).toBe(true)
    expect(mockAttemptDetailFirst).not.toHaveBeenCalled()
  })

  it('ingests missing candidate via detail-first and records published outcome', async () => {
    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: {
        maxAttemptsPerRun: 5,
        maxCandidatesScannedPerRun: 10,
        failedRetryHours: 6,
        leaseSeconds: 300,
        maxRuntimeMs: 60_000,
      },
    })
    expect(result.telemetry.published).toBe(1)
    expect(result.telemetry.detailFirstAttempts).toBe(1)
    expect(mockAttemptDetailFirst).toHaveBeenCalledTimes(1)
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.anything(),
      DETAIL_URL,
      expect.objectContaining({ outcome: 'published', lootauraVisible: true })
    )
    expect(mockReleaseLease).toHaveBeenCalledWith(
      'ystm_coverage_missing_ingestion',
      expect.anything(),
      expect.objectContaining({ nextCursor: 0, markCompleted: true })
    )
  })
})
