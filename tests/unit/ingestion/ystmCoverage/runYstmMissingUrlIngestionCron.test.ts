import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAcquireLease = vi.hoisted(() => vi.fn())
const mockReleaseLease = vi.hoisted(() => vi.fn())
const mockFetchPage = vi.hoisted(() => vi.fn())
const mockLoadPublishedIndex = vi.hoisted(() => vi.fn())
const mockFindPublished = vi.hoisted(() => vi.fn())
const mockAttemptDetailFirst = vi.hoisted(() => vi.fn())
const mockRecordOutcome = vi.hoisted(() => vi.fn())
const mockFromBase = vi.hoisted(() => vi.fn())

const mockFetchFetchFailedCandidates = vi.hoisted(() => vi.fn())
const mockLoadWouldPublish = vi.hoisted(() => vi.fn())
const mockCountHot = vi.hoisted(() => vi.fn())
const mockCountCold = vi.hoisted(() => vi.fn())
const mockFetchHot = vi.hoisted(() => vi.fn())
const mockAttemptListFast = vi.hoisted(() => vi.fn())
const mockBackfillExpired = vi.hoisted(() => vi.fn())
const mockBackfillPnvDisposition = vi.hoisted(() => vi.fn())
const mockBackfillTerminalDisposition = vi.hoisted(() => vi.fn())
const mockBackfillCoverageVisibility = vi.hoisted(() => vi.fn())
const mockBackfillScheduleWait = vi.hoisted(() => vi.fn())
const mockBackfillUrlReuseExpiredInventory = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/ystmCoverage/backfillExpiredListFastObservationInvalidation', () => ({
  backfillExpiredListFastObservationInvalidation: mockBackfillExpired,
}))

vi.mock('@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation', () => ({
  backfillPublishedNotVisibleDispositionInvalidation: mockBackfillPnvDisposition,
}))

vi.mock('@/lib/ingestion/ystmCoverage/backfillTerminalDispositionObservationInvalidation', () => ({
  backfillTerminalDispositionObservationInvalidation: mockBackfillTerminalDisposition,
}))

vi.mock('@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation', () => ({
  backfillCoverageVisibilityReconciliation: mockBackfillCoverageVisibility,
}))

vi.mock('@/lib/ingestion/ystmCoverage/backfillGatedFalsePositiveScheduleWaitReconciliation', () => ({
  backfillGatedFalsePositiveScheduleWaitReconciliation: mockBackfillScheduleWait,
}))

vi.mock('@/lib/ingestion/ystmCoverage/backfillUrlReuseExpiredInventoryReclassification', () => ({
  backfillUrlReuseExpiredInventoryReclassification: mockBackfillUrlReuseExpiredInventory,
}))

vi.mock('@/lib/ingestion/ystmCoverage/missingIngestFetchFailedCandidates', () => ({
  fetchMissingIngestFetchFailedCandidates: mockFetchFetchFailedCandidates,
  loadWouldPublishShadowCanonicalUrls: mockLoadWouldPublish,
}))

vi.mock('@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode', () => ({
  fetchCoverageBootstrapEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/ingestion/ingestionOrchestrationLease', () => ({
  acquireIngestionOrchestrationLease: mockAcquireLease,
  releaseIngestionOrchestrationLease: mockReleaseLease,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoverageMissingCandidates', () => ({
  countHotMissingQueueTotal: mockCountHot,
  countColdMissingQueueTotal: mockCountCold,
  fetchHotMissingIngestionCandidates: mockFetchHot,
  fetchColdMissingIngestionCandidatePage: mockFetchPage,
  fetchMissingIngestionCandidatePage: mockFetchPage,
  isEligibleForMissingIngestionRetry: vi.fn(() => true),
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex', () => ({
  loadLootAuraPublishedYstmIndex: mockLoadPublishedIndex,
}))

vi.mock('@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst', () => ({
  findPublishedIngestedSaleIdForDetailFirst: mockFindPublished,
}))

vi.mock('@/lib/ingestion/acquisition/ystmListFastPublish', () => ({
  attemptYstmListFastPublish: mockAttemptListFast,
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

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore')>()
  return {
    ...actual,
    recordYstmCoverageMissingIngestionOutcome: mockRecordOutcome,
  }
})

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: mockFromBase,
}))

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

const HOT_URL =
  'https://yardsaletreasuremap.com/US/Texas/Austin/100-Main-St/88888888/userlisting.html'

const HOT_LIST_METADATA = {
  canonicalUrl: HOT_URL,
  sourceUrl: HOT_URL,
  title: 'Hot queue sale',
  address: '100 Main St',
  startDate: '2026-07-01',
  endDate: '2026-07-02',
  lat: 30.27,
  lng: -97.74,
  description: null,
  imageUrls: [] as string[],
  postedAt: null,
}

const DEFAULT_BUDGETS = {
  maxAttemptsPerRun: 5,
  maxCandidatesScannedPerRun: 10,
  failedRetryHours: 6,
  leaseSeconds: 300,
  maxRuntimeMs: 60_000,
}

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
    mockFetchFetchFailedCandidates.mockReset()
    mockLoadWouldPublish.mockReset()
    mockCountHot.mockReset()
    mockCountCold.mockReset()
    mockFetchHot.mockReset()
    mockAttemptListFast.mockReset()
    mockBackfillExpired.mockReset()
    mockBackfillPnvDisposition.mockReset()
    mockBackfillTerminalDisposition.mockReset()
    mockBackfillCoverageVisibility.mockReset()
    mockBackfillScheduleWait.mockReset()
    mockBackfillUrlReuseExpiredInventory.mockReset()

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
    mockLoadWouldPublish.mockResolvedValue(new Set<string>())
    mockFetchFetchFailedCandidates.mockResolvedValue([])
    mockCountHot.mockResolvedValue(0)
    mockCountCold.mockResolvedValue(1)
    mockFetchHot.mockResolvedValue([])
    mockAttemptListFast.mockResolvedValue({ outcome: 'failed', reason: 'test_skip' })
    mockBackfillExpired.mockResolvedValue({ updated: 0 })
    mockBackfillPnvDisposition.mockResolvedValue({ updated: 0, archived: 0, expired: 0 })
    mockBackfillTerminalDisposition.mockResolvedValue({ updated: 0, skipped: 0 })
    mockBackfillCoverageVisibility.mockResolvedValue({ scanned: 0, updated: 0 })
    mockBackfillScheduleWait.mockResolvedValue({ scanned: 0, updated: 0 })
    mockBackfillUrlReuseExpiredInventory.mockResolvedValue({
      scanned: 0,
      updated: 0,
      terminalDispositionUpdated: 0,
      expiredFalsePositiveUpdated: 0,
    })
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
      budgets: DEFAULT_BUDGETS,
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
      budgets: DEFAULT_BUDGETS,
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

  it('runs fetch_failed priority pass before general missing queue', async () => {
    const fetchFailedUrl =
      'https://yardsaletreasuremap.com/US/Texas/Austin/100-Main-St/99999999/userlisting.html'
    mockFetchFetchFailedCandidates.mockResolvedValue([
      {
        canonicalUrl: fetchFailedUrl,
        city: 'Austin',
        state: 'TX',
        configKey: 'TX|Austin',
        missingIngestionOutcome: 'failed',
        missingIngestionAttemptedAt: '2026-06-10T00:00:00.000Z',
        missingIngestionReplayCount: 1,
        missingIngestionLastRetryAt: null,
      },
    ])
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
      queueTotal: 2,
      nextQueueOffset: 1,
    })
    mockAttemptDetailFirst
      .mockResolvedValueOnce({
        result: { outcome: 'failed', reason: 'fetch_failed' },
        metrics: { attempted: 1, published: 0, succeeded: 0, fallback: 0, fetchFailed: 1 },
      })
      .mockResolvedValueOnce({
        result: { outcome: 'ready', ingestedSaleId: 'sale-1', published: true },
        metrics: { attempted: 1, published: 1, succeeded: 1, fallback: 0, fetchFailed: 0 },
      })

    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: DEFAULT_BUDGETS,
    })

    expect(result.telemetry.fetchFailedPriorityClaimed).toBe(1)
    expect(result.telemetry.fetchFailedPriorityAttempts).toBe(1)
    expect(result.telemetry.fetchFailedPriorityFailed).toBe(1)
    expect(result.telemetry.published).toBe(1)
    expect(mockAttemptDetailFirst).toHaveBeenCalledTimes(2)
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.anything(),
      fetchFailedUrl,
      expect.objectContaining({
        outcome: 'failed',
        failureReason: 'fetch_failed',
        missingIngestionReplayCount: 2,
      })
    )
  })

  it('computes positive hot budget and fetch limit when hot queue exists', async () => {
    mockCountHot.mockResolvedValue(54)
    mockCountCold.mockResolvedValue(570)

    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: DEFAULT_BUDGETS,
    })

    expect(result.telemetry.hotQueueTotal).toBe(54)
    expect(result.telemetry.reservedHotBudget).toBeGreaterThan(0)
    expect(result.telemetry.hotFetchLimit).toBeGreaterThan(0)
    expect(mockFetchHot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: result.telemetry.hotFetchLimit })
    )
    expect(mockFetchPage).not.toHaveBeenCalled()
  })

  it('processes hot candidates before cold and skips cold while hot queue exists', async () => {
    mockCountHot.mockResolvedValue(2)
    mockCountCold.mockResolvedValue(5)
    mockFetchHot.mockResolvedValue([
      {
        canonicalUrl: HOT_URL,
        city: 'Austin',
        state: 'TX',
        configKey: 'TX|Austin',
        missingIngestionOutcome: null,
        missingIngestionAttemptedAt: null,
        discoveryPriority: 'hot',
        listMetadataSnapshot: HOT_LIST_METADATA,
        firstListSeenAt: '2026-06-19T20:00:00.000Z',
      },
    ])
    mockAttemptListFast.mockResolvedValue({
      outcome: 'published',
      ingestedSaleId: 'sale-hot-1',
    })

    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: DEFAULT_BUDGETS,
    })

    expect(mockFetchHot).toHaveBeenCalled()
    expect(mockFetchPage).not.toHaveBeenCalled()
    expect(result.telemetry.hotCandidatesScanned).toBe(1)
    expect(result.telemetry.hotCandidatesAttempted).toBe(1)
    expect(result.telemetry.listFastAttempts).toBe(1)
    expect(result.telemetry.listFastPublished).toBe(1)
    expect(mockAttemptDetailFirst).not.toHaveBeenCalled()
  })

  it('drains cold queue when hot queue is empty', async () => {
    mockCountHot.mockResolvedValue(0)
    mockCountCold.mockResolvedValue(3)

    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: DEFAULT_BUDGETS,
    })

    expect(mockFetchHot).not.toHaveBeenCalled()
    expect(mockFetchPage).toHaveBeenCalled()
    expect(result.telemetry.coldCandidatesScanned).toBe(1)
    expect(result.telemetry.hotFetchLimit).toBe(0)
  })

  it('increments list-fast failure counters for hot list-fast failures', async () => {
    mockCountHot.mockResolvedValue(1)
    mockCountCold.mockResolvedValue(0)
    mockFetchHot.mockResolvedValue([
      {
        canonicalUrl: HOT_URL,
        city: 'Austin',
        state: 'TX',
        configKey: 'TX|Austin',
        missingIngestionOutcome: null,
        missingIngestionAttemptedAt: null,
        discoveryPriority: 'hot',
        listMetadataSnapshot: HOT_LIST_METADATA,
        firstListSeenAt: '2026-06-19T20:00:00.000Z',
      },
    ])
    mockAttemptListFast.mockResolvedValue({ outcome: 'failed', reason: 'test_skip' })

    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: DEFAULT_BUDGETS,
    })

    expect(result.telemetry.listFastAttempts).toBe(1)
    expect(result.telemetry.listFastFailed).toBe(1)
    expect(result.telemetry.listFastPublished).toBe(0)
    expect(result.telemetry.failed).toBe(1)
  })

  it('records list-fast skipped_invalid expired without detail-first fallback', async () => {
    mockCountHot.mockResolvedValue(1)
    mockCountCold.mockResolvedValue(0)
    mockFetchHot.mockResolvedValue([
      {
        canonicalUrl: HOT_URL,
        city: 'Austin',
        state: 'TX',
        configKey: 'TX|Austin',
        missingIngestionOutcome: null,
        missingIngestionAttemptedAt: null,
        discoveryPriority: 'hot',
        listMetadataSnapshot: {
          ...HOT_LIST_METADATA,
          startDate: '2020-01-01',
          endDate: '2020-01-02',
        },
        firstListSeenAt: '2026-06-19T20:00:00.000Z',
      },
    ])
    mockAttemptListFast.mockResolvedValue({ outcome: 'skipped_invalid', reason: 'expired' })

    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: DEFAULT_BUDGETS,
    })

    expect(mockAttemptListFast).toHaveBeenCalledTimes(1)
    expect(mockAttemptDetailFirst).not.toHaveBeenCalled()
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.anything(),
      HOT_URL,
      expect.objectContaining({
        outcome: 'failed',
        failureReason: 'expired',
        missingIngestionFailureDetails: null,
      })
    )
    expect(result.telemetry.listFastFailed).toBe(1)
    expect(result.telemetry.failed).toBe(1)
    expect(result.telemetry.expiredObservationBackfillUpdated).toBe(0)
    expect(result.telemetry.publishedNotVisibleDispositionBackfillUpdated).toBe(0)
    expect(result.telemetry.terminalDispositionBackfillUpdated).toBe(0)
    expect(result.telemetry.coverageVisibilityReconciliationUpdated).toBe(0)
    expect(result.telemetry.scheduleWaitReconciliationUpdated).toBe(0)
    expect(mockBackfillExpired).toHaveBeenCalledTimes(1)
    expect(mockBackfillPnvDisposition).toHaveBeenCalledTimes(1)
    expect(mockBackfillTerminalDisposition).toHaveBeenCalledTimes(1)
    expect(mockBackfillCoverageVisibility).toHaveBeenCalledTimes(1)
    expect(mockBackfillScheduleWait).toHaveBeenCalledTimes(1)
  })

  it('runs observation invalidation backfills after successful pass', async () => {
    mockBackfillExpired.mockResolvedValue({ updated: 48 })
    mockBackfillPnvDisposition.mockResolvedValue({ updated: 1, archived: 0, expired: 1 })
    mockBackfillTerminalDisposition.mockResolvedValue({ updated: 146, skipped: 0 })
    mockBackfillCoverageVisibility.mockResolvedValue({ scanned: 7, updated: 7 })
    mockBackfillScheduleWait.mockResolvedValue({ scanned: 71, updated: 65 })
    mockCountHot.mockResolvedValue(0)
    mockCountCold.mockResolvedValue(0)

    const { runYstmMissingUrlIngestionCron } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const result = await runYstmMissingUrlIngestionCron({} as never, {
      budgets: DEFAULT_BUDGETS,
    })

    expect(mockBackfillExpired).toHaveBeenCalledTimes(1)
    expect(mockBackfillPnvDisposition).toHaveBeenCalledTimes(1)
    expect(mockBackfillTerminalDisposition).toHaveBeenCalledTimes(1)
    expect(mockBackfillCoverageVisibility).toHaveBeenCalledTimes(1)
    expect(mockBackfillScheduleWait).toHaveBeenCalledTimes(1)
    expect(mockBackfillExpired.mock.invocationCallOrder[0]).toBeLessThan(
      mockBackfillPnvDisposition.mock.invocationCallOrder[0]
    )
    expect(mockBackfillPnvDisposition.mock.invocationCallOrder[0]).toBeLessThan(
      mockBackfillTerminalDisposition.mock.invocationCallOrder[0]
    )
    expect(mockBackfillTerminalDisposition.mock.invocationCallOrder[0]).toBeLessThan(
      mockBackfillCoverageVisibility.mock.invocationCallOrder[0]
    )
    expect(mockBackfillCoverageVisibility.mock.invocationCallOrder[0]).toBeLessThan(
      mockBackfillScheduleWait.mock.invocationCallOrder[0]
    )
    expect(result.telemetry.expiredObservationBackfillUpdated).toBe(48)
    expect(result.telemetry.publishedNotVisibleDispositionBackfillUpdated).toBe(1)
    expect(result.telemetry.terminalDispositionBackfillUpdated).toBe(146)
    expect(result.telemetry.coverageVisibilityReconciliationUpdated).toBe(7)
    expect(result.telemetry.scheduleWaitReconciliationUpdated).toBe(65)
  })
})

describe('hot missing ingest budget helpers', () => {
  it('computeReservedHotBudget returns zero when hot queue is empty', async () => {
    const { computeReservedHotBudget, computeHotFetchLimit } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    expect(computeReservedHotBudget(0, 60)).toBe(0)
    expect(computeHotFetchLimit(0, 0, 200)).toBe(0)
  })

  it('computeReservedHotBudget and computeHotFetchLimit stay positive when hot queue exists', async () => {
    const { computeReservedHotBudget, computeHotFetchLimit } = await import(
      '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
    )
    const reserved = computeReservedHotBudget(54, 60)
    const fetchLimit = computeHotFetchLimit(54, reserved, 200)
    expect(reserved).toBe(51)
    expect(fetchLimit).toBe(102)
  })
})
