import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGeocodePendingSales = vi.fn()
const mockProcessGeocodeQueueBatch = vi.fn()
const mockRunBoundedGeocodeDeadLetterReplay = vi.fn()

vi.mock('@/lib/ingestion/geocodeQueue', () => ({
  processGeocodeQueueBatch: (...args: unknown[]) => mockProcessGeocodeQueueBatch(...args),
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  geocodePendingSales: (...args: unknown[]) => mockGeocodePendingSales(...args),
}))

vi.mock('@/lib/geocode/geocodeDeadLetterReplay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/geocode/geocodeDeadLetterReplay')>()
  return {
    ...actual,
    runBoundedGeocodeDeadLetterReplay: (...args: unknown[]) => mockRunBoundedGeocodeDeadLetterReplay(...args),
  }
})

describe('runGeocodeCronPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProcessGeocodeQueueBatch.mockResolvedValue({ dequeued: 1, completed: 1, requeued: 0 })
    mockGeocodePendingSales.mockResolvedValue({
      claimed: 2,
      succeeded: 1,
      failedRetriable: 1,
      failedTerminal: 0,
      rate429Count: 0,
      processed: 2,
      publishTriggered: 1,
    })
    mockRunBoundedGeocodeDeadLetterReplay.mockResolvedValue({
      attempted: 3,
      eligible: 2,
      replayed: 1,
      skipped: {},
      updateErrors: 0,
      lostRaces: 0,
    })
  })

  it('runs transient replay when 429 pressure is below threshold', async () => {
    const { runGeocodeCronPipeline } = await import('@/lib/ingestion/geocodeCronPipeline')
    const result = await runGeocodeCronPipeline({
      queueBatchSize: 20,
      backlogBatchSize: 15,
      concurrencyCeiling: 2,
      telemetryContext: { jobType: 'cron.geocode' },
    })

    expect(mockRunBoundedGeocodeDeadLetterReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTransientProvider: true,
        requireNullCoordinates: true,
      })
    )
    expect(result.replay.replayed).toBe(1)
    expect(result.replay.skippedDueTo429Pressure).toBe(false)
  })

  it('skips replay when backlog 429 count exceeds threshold', async () => {
    mockGeocodePendingSales.mockResolvedValue({
      claimed: 2,
      succeeded: 0,
      failedRetriable: 2,
      failedTerminal: 0,
      rate429Count: 12,
      processed: 2,
      publishTriggered: 0,
    })

    const { runGeocodeCronPipeline } = await import('@/lib/ingestion/geocodeCronPipeline')
    const result = await runGeocodeCronPipeline({
      queueBatchSize: 20,
      backlogBatchSize: 15,
      concurrencyCeiling: 2,
      telemetryContext: { jobType: 'cron.geocode' },
    })

    expect(mockRunBoundedGeocodeDeadLetterReplay).not.toHaveBeenCalled()
    expect(result.replay.skippedDueTo429Pressure).toBe(true)
    expect(result.replay.replayed).toBe(0)
  })
})
