import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockAssertCronAuthorized = vi.fn()

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: (...args: unknown[]) => mockAssertCronAuthorized(...args),
}))

const mockResolveAdaptiveThroughputForCron = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/adaptiveThroughputSignals', () => ({
  resolveAdaptiveThroughputForCron: mockResolveAdaptiveThroughputForCron,
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  geocodePendingSales: vi.fn().mockResolvedValue({
    claimed: 0,
    succeeded: 0,
    failedRetriable: 0,
    failedTerminal: 0,
    rate429Count: 0,
  }),
}))

vi.mock('@/lib/ingestion/publishWorker', () => ({
  publishReadyIngestedSales: vi.fn().mockResolvedValue({
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  }),
  finalizeLinkedPublishedIngestedSales: vi.fn().mockResolvedValue({
    attempted: 0,
    finalized: 0,
    alreadyPublished: 0,
    linkMismatch: 0,
    missingLinkedSale: 0,
  }),
}))

vi.mock('@/lib/ingestion/orchestrationMetrics', () => ({
  recordIngestionOrchestrationRun: vi.fn().mockResolvedValue(undefined),
  fetchLastSuccessfulExternalIngestionAt: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  generateOperationId: vi.fn(() => 'op-lane-test'),
}))

describe('GET /api/cron/daily?mode=ingestion lane param', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    mockAssertCronAuthorized.mockImplementation(() => {})
    const { installAdaptiveThroughputCronMock } = await import('../../helpers/mockAdaptiveThroughputForCron')
    installAdaptiveThroughputCronMock(mockResolveAdaptiveThroughputForCron)
    delete process.env.INGESTION_LANE_MODE
  })

  it('returns 400 for invalid lane when lane mode enabled', async () => {
    process.env.INGESTION_LANE_MODE = 'true'
    const { GET } = await import('@/app/api/cron/daily/route')
    const req = new NextRequest('http://localhost/api/cron/daily?mode=ingestion&lane=invalid-lane', {
      method: 'GET',
      headers: { authorization: 'Bearer test-cron-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.code).toBe('INVALID_INGESTION_LANE')
  })
})
