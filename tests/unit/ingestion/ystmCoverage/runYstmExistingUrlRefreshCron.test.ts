import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAcquireLease = vi.hoisted(() => vi.fn())
const mockReleaseLease = vi.hoisted(() => vi.fn())
const mockFetchPage = vi.hoisted(() => vi.fn())
const mockAttemptDetailFirst = vi.hoisted(() => vi.fn())
const mockMarkVisible = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode', () => ({
  fetchCoverageBootstrapEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/ingestion/ingestionOrchestrationLease', () => ({
  acquireIngestionOrchestrationLease: mockAcquireLease,
  releaseIngestionOrchestrationLease: mockReleaseLease,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshCandidates', () => ({
  fetchExistingUrlRefreshCandidatePage: mockFetchPage,
  isEligibleForExistingUrlRefresh: vi.fn(() => true),
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshMetrics', () => ({
  markCoverageObservationVisibleForSourceUrl: mockMarkVisible,
  aggregateYstmExistingUrlRefresh: vi.fn(),
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

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

describe('runYstmExistingUrlRefreshCron', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAcquireLease.mockReset()
    mockReleaseLease.mockReset()
    mockFetchPage.mockReset()
    mockAttemptDetailFirst.mockReset()
    mockMarkVisible.mockReset()

    mockAcquireLease.mockResolvedValue({
      acquired: true,
      owner: 'owner-1',
      staleRecovered: false,
      cursor: 0,
    })
    mockReleaseLease.mockResolvedValue(undefined)
    mockFetchPage.mockResolvedValue({
      candidates: [
        {
          ingestedSaleId: 'ing-1',
          sourceUrl: DETAIL_URL,
          city: 'Louisville',
          state: 'KY',
          publishedSaleId: 'sale-1',
          status: 'ready',
          lastSourceSyncAt: null,
        },
      ],
      queueOffset: 0,
      queueTotal: 1,
      nextQueueOffset: 0,
    })
    mockAttemptDetailFirst.mockResolvedValue({
      result: { outcome: 'ready', ingestedSaleId: 'ing-1', published: true },
      metrics: { attempted: 1, published: 1, succeeded: 1, fallback: 0, fetchFailed: 0 },
    })
    mockMarkVisible.mockResolvedValue(undefined)
  })

  it('refreshes stale candidate via detail-first update path', async () => {
    const { runYstmExistingUrlRefreshCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmExistingUrlRefreshCron'
    )
    const result = await runYstmExistingUrlRefreshCron({} as never, {
      budgets: {
        maxRefreshesPerRun: 5,
        maxCandidatesScannedPerRun: 10,
        staleSyncHours: 12,
        leaseSeconds: 300,
        maxRuntimeMs: 60_000,
      },
    })
    expect(result.telemetry.refreshed).toBe(1)
    expect(result.telemetry.published).toBe(1)
    expect(mockAttemptDetailFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        existingIngestedSaleId: 'ing-1',
        listSeed: expect.objectContaining({ sourceUrl: DETAIL_URL }),
      })
    )
    expect(mockMarkVisible).toHaveBeenCalled()
  })
})
