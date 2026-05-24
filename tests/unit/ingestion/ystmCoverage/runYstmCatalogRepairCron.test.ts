import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAcquireLease = vi.hoisted(() => vi.fn())
const mockReleaseLease = vi.hoisted(() => vi.fn())
const mockFetchPage = vi.hoisted(() => vi.fn())
const mockAttemptDetailFirst = vi.hoisted(() => vi.fn())
const mockFollowUp = vi.hoisted(() => vi.fn())
const mockRecordOutcome = vi.hoisted(() => vi.fn())
const mockMarkVisible = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode', () => ({
  fetchCoverageBootstrapEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/ingestion/ingestionOrchestrationLease', () => ({
  acquireIngestionOrchestrationLease: mockAcquireLease,
  releaseIngestionOrchestrationLease: mockReleaseLease,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCatalogRepairCandidates', () => ({
  fetchCatalogRepairCandidatePage: mockFetchPage,
  isEligibleForCatalogRepairRetry: vi.fn(() => true),
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCatalogRepairFollowUp', () => ({
  followUpCatalogRepairPublishOrGeocode: mockFollowUp,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCatalogRepairStore', () => ({
  recordYstmCatalogRepairOutcome: mockRecordOutcome,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshMetrics', () => ({
  markCoverageObservationVisibleForSourceUrl: mockMarkVisible,
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

describe('runYstmCatalogRepairCron', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAcquireLease.mockReset()
    mockReleaseLease.mockReset()
    mockFetchPage.mockReset()
    mockAttemptDetailFirst.mockReset()
    mockFollowUp.mockReset()
    mockRecordOutcome.mockReset()
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
          status: 'needs_geocode',
          publishedSaleId: null,
          catalogRepairOutcome: null,
          catalogRepairAttemptedAt: null,
        },
      ],
      queueOffset: 0,
      queueTotal: 1,
      nextQueueOffset: 0,
    })
    mockAttemptDetailFirst.mockResolvedValue({
      result: { outcome: 'ready', ingestedSaleId: 'ing-1', published: false },
      metrics: { attempted: 1, published: 0, succeeded: 1, fallback: 0, fetchFailed: 0 },
    })
    mockFollowUp.mockResolvedValue({
      kind: 'published',
      publishedSaleId: 'sale-1',
    })
    mockRecordOutcome.mockResolvedValue(undefined)
    mockMarkVisible.mockResolvedValue(undefined)
  })

  it('repairs candidate via detail-first then publish follow-up', async () => {
    const { runYstmCatalogRepairCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmCatalogRepairCron'
    )
    const result = await runYstmCatalogRepairCron({} as never, {
      budgets: {
        maxRepairsPerRun: 5,
        maxCandidatesScannedPerRun: 10,
        failedRetryHours: 6,
        leaseSeconds: 300,
        maxRuntimeMs: 60_000,
      },
    })
    expect(result.telemetry.published).toBe(1)
    expect(result.telemetry.repairAttempts).toBe(1)
    expect(mockAttemptDetailFirst).toHaveBeenCalledWith(
      expect.objectContaining({ existingIngestedSaleId: 'ing-1' })
    )
    expect(mockFollowUp).toHaveBeenCalledWith(expect.anything(), 'ing-1')
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.anything(),
      'ing-1',
      expect.objectContaining({ outcome: 'published' })
    )
  })
})
