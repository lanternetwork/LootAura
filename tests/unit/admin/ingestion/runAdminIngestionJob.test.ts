import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_INGESTION_JOB_KEYS, isAdminIngestionJobKey } from '@/lib/admin/ingestion/adminIngestionJobTypes'

const mockRunMissing = vi.hoisted(() => vi.fn())
const mockRunFresh = vi.hoisted(() => vi.fn())
const mockRunAudit = vi.hoisted(() => vi.fn())
const mockRunRepair = vi.hoisted(() => vi.fn())
const mockRunShadow = vi.hoisted(() => vi.fn())
const mockGeocodeLease = vi.hoisted(() => vi.fn())
const mockGeocodePipeline = vi.hoisted(() => vi.fn())
const mockResolveAdaptive = vi.hoisted(() => vi.fn())
const mockRunDaily = vi.hoisted(() => vi.fn())
const mockResolveLane = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron', () => ({
  runYstmMissingUrlIngestionCron: mockRunMissing,
}))

vi.mock('@/lib/ingestion/ystmCoverage/runYstmFreshDiscoveryCron', () => ({
  runYstmFreshDiscoveryCron: mockRunFresh,
}))

vi.mock('@/lib/ingestion/ystmCoverage/runYstmCoverageAuditCron', () => ({
  runYstmCoverageAuditCron: mockRunAudit,
}))

vi.mock('@/lib/ingestion/ystmCoverage/runYstmCatalogRepairCron', () => ({
  runYstmCatalogRepairCron: mockRunRepair,
}))

vi.mock('@/lib/admin/ingestion/runAdminShadowReplay', () => ({
  runAdminShadowReplay: mockRunShadow,
}))

vi.mock('@/lib/ingestion/geocodePipelineLease', () => ({
  runWithGeocodePipelineLease: mockGeocodeLease,
}))

vi.mock('@/lib/ingestion/geocodeCronPipeline', () => ({
  runGeocodeCronPipeline: mockGeocodePipeline,
}))

vi.mock('@/lib/ingestion/adaptiveThroughputSignals', () => ({
  resolveAdaptiveThroughputForCron: mockResolveAdaptive,
}))

vi.mock('@/lib/ingestion/dailyIngestionOrchestration', () => ({
  runIngestionOrchestration: mockRunDaily,
}))

vi.mock('@/lib/ingestion/resolveIngestionLaneContext', () => ({
  resolveIngestionLaneContext: mockResolveLane,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
}))

describe('adminIngestionJobTypes', () => {
  it('recognizes supported job keys', () => {
    for (const key of ADMIN_INGESTION_JOB_KEYS) {
      expect(isAdminIngestionJobKey(key)).toBe(true)
    }
    expect(isAdminIngestionJobKey('unknown')).toBe(false)
  })
})

describe('runAdminIngestionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveAdaptive.mockResolvedValue({
      envelope: {
        geocode: { queueBatchSize: 5, backlogBatchSize: 10, concurrencyCeiling: 2 },
      },
    })
    mockResolveLane.mockResolvedValue({
      ok: true,
      context: { lane: { laneKey: 'default' }, laneModeEnabled: false, rotationApplied: false },
    })
  })

  it('returns skipped when missing ingest lease overlap', async () => {
    mockRunMissing.mockResolvedValue({
      ok: true,
      detailFirstMetrics: { attempted: 0, published: 0, fallback: 0 },
      telemetry: {
        skipped: true,
        skipReason: 'active_lease',
        queueTotal: 0,
        candidatesScanned: 0,
        published: 0,
        ingested: 0,
        failed: 0,
        listFastAttempts: 0,
        listFastPublished: 0,
        listFastFailed: 0,
        hotQueueTotal: 0,
        coldQueueTotal: 0,
        overlapPrevented: true,
      },
    })

    const { runAdminIngestionJob } = await import('@/lib/admin/ingestion/runAdminIngestionJob')
    const result = await runAdminIngestionJob('missing_ingest')

    expect(result.ok).toBe(true)
    expect(result.status).toBe('skipped')
    expect(result.skipReason).toBe('active_lease')
  })

  it('returns failed with sanitized error when runner throws', async () => {
    mockRunMissing.mockRejectedValue(
      new Error('column missing https://yardsaletreasuremap.com/x')
    )

    const { runAdminIngestionJob } = await import('@/lib/admin/ingestion/runAdminIngestionJob')
    const result = await runAdminIngestionJob('missing_ingest')

    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).not.toContain('yardsaletreasuremap.com')
    expect(result.error).toContain('[redacted-url]')
  })

  it('returns success for shadow replay', async () => {
    mockRunShadow.mockResolvedValue({
      generatedAt: '2026-06-21T00:00:00.000Z',
      replayedCount: 3,
      divergenceOldSuppressNewPublishCount: 1,
    })

    const { runAdminIngestionJob } = await import('@/lib/admin/ingestion/runAdminIngestionJob')
    const result = await runAdminIngestionJob('shadow_replay')

    expect(result.ok).toBe(true)
    expect(result.status).toBe('success')
    expect(result.telemetry?.replayedCount).toBe(3)
  })

  it('returns skipped when geocode lease is held', async () => {
    mockGeocodeLease.mockResolvedValue({
      ok: true,
      skipped: true,
      reason: 'active_lease',
      lease: { acquired: false, cursor: 0, owner: '', staleRecovered: false },
    })

    const { runAdminIngestionJob } = await import('@/lib/admin/ingestion/runAdminIngestionJob')
    const result = await runAdminIngestionJob('geocode')

    expect(result.status).toBe('skipped')
    expect(result.skipReason).toBe('active_lease')
  })
})
