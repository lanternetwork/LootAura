import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  geocodePendingSales: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  geocodePendingSales: hoisted.geocodePendingSales,
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: hoisted.loggerInfo,
    warn: hoisted.loggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('preview backlog drain', () => {
  beforeEach(async () => {
    const env = process.env as Record<string, string | undefined>
    vi.resetModules()
    vi.clearAllMocks()
    env.NODE_ENV = 'test'
    env.VERCEL_ENV = 'test'
    delete env.GEOCODE_BACKLOG_BATCH_SIZE
    delete env.PREVIEW_GEOCODE_BACKLOG_COOLDOWN_MINUTES
    delete env.PREVIEW_GEOCODE_BACKLOG_LEASE_TTL_SECONDS
    env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    env.UPSTASH_REDIS_REST_TOKEN = 'token'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: 'OK' }),
      })
    )
  })

  it('is preview-gated and impossible in production/staging paths', async () => {
    const env = process.env as Record<string, string | undefined>
    const { maybeRunPreviewBacklogDrain, __resetPreviewBacklogDrainStateForTests } = await import(
      '@/lib/ingestion/previewBacklogDrain'
    )
    __resetPreviewBacklogDrainStateForTests()

    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'production'
    await maybeRunPreviewBacklogDrain('test')
    expect(hoisted.geocodePendingSales).not.toHaveBeenCalled()

    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'preview'
    await maybeRunPreviewBacklogDrain('test')
    expect(hoisted.geocodePendingSales).toHaveBeenCalledTimes(1)
  })

  it('fails closed when redis lease config is missing', async () => {
    const env = process.env as Record<string, string | undefined>
    const { maybeRunPreviewBacklogDrain, __resetPreviewBacklogDrainStateForTests } = await import(
      '@/lib/ingestion/previewBacklogDrain'
    )
    __resetPreviewBacklogDrainStateForTests()
    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'preview'
    delete env.UPSTASH_REDIS_REST_URL
    delete env.UPSTASH_REDIS_REST_TOKEN

    await maybeRunPreviewBacklogDrain('test')
    await maybeRunPreviewBacklogDrain('test')

    expect(hoisted.geocodePendingSales).not.toHaveBeenCalled()
    expect(hoisted.loggerWarn).toHaveBeenCalled()
    const cooldownSkips = hoisted.loggerInfo.mock.calls.filter(
      (c) => c[1]?.operation === 'cooldown_skip'
    )
    expect(cooldownSkips.length).toBe(0)
  })

  it('enforces in-process cooldown/debounce', async () => {
    const env = process.env as Record<string, string | undefined>
    const { maybeRunPreviewBacklogDrain, __resetPreviewBacklogDrainStateForTests } = await import(
      '@/lib/ingestion/previewBacklogDrain'
    )
    __resetPreviewBacklogDrainStateForTests()
    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'preview'
    env.PREVIEW_GEOCODE_BACKLOG_COOLDOWN_MINUTES = '5'

    hoisted.geocodePendingSales.mockResolvedValue({
      claimed: 1,
      succeeded: 1,
      failedRetriable: 0,
      failedTerminal: 0,
      rate429Count: 0,
      processed: 1,
      publishTriggered: 1,
      publishOk: 1,
      publishFailed: 0,
      claimedRowIds: ['row-1'],
    })

    await maybeRunPreviewBacklogDrain('test')
    await maybeRunPreviewBacklogDrain('test')

    expect(hoisted.geocodePendingSales).toHaveBeenCalledTimes(1)
  })

  it('caps batch size at 100 and awaits geocodePendingSales', async () => {
    const env = process.env as Record<string, string | undefined>
    const { maybeRunPreviewBacklogDrain, __resetPreviewBacklogDrainStateForTests } = await import(
      '@/lib/ingestion/previewBacklogDrain'
    )
    __resetPreviewBacklogDrainStateForTests()
    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'preview'
    env.GEOCODE_BACKLOG_BATCH_SIZE = '999'

    let completed = false
    hoisted.geocodePendingSales.mockImplementation(async () => {
      await Promise.resolve()
      completed = true
      return {
        claimed: 2,
        succeeded: 2,
        failedRetriable: 0,
        failedTerminal: 0,
        rate429Count: 0,
        processed: 2,
        publishTriggered: 2,
        publishOk: 2,
        publishFailed: 0,
        claimedRowIds: ['row-1', 'row-2'],
      }
    })

    await maybeRunPreviewBacklogDrain('test')

    expect(hoisted.geocodePendingSales).toHaveBeenCalledWith({
      batchSizeOverride: 100,
      captureClaimedRowIds: true,
    })
    expect(completed).toBe(true)
    expect(hoisted.loggerInfo).toHaveBeenCalled()
  })

  it('does not advance cooldown when lease is not acquired', async () => {
    const env = process.env as Record<string, string | undefined>
    const { maybeRunPreviewBacklogDrain, __resetPreviewBacklogDrainStateForTests } = await import(
      '@/lib/ingestion/previewBacklogDrain'
    )
    __resetPreviewBacklogDrainStateForTests()
    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'preview'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: null }),
      })
    )

    await maybeRunPreviewBacklogDrain('test')
    await maybeRunPreviewBacklogDrain('test')

    expect(hoisted.geocodePendingSales).not.toHaveBeenCalled()
    const cooldownSkips = hoisted.loggerInfo.mock.calls.filter(
      (c) => c[1]?.operation === 'cooldown_skip'
    )
    expect(cooldownSkips.length).toBe(0)
    const lifecycles = hoisted.loggerInfo.mock.calls.filter((c) => c[1]?.operation === 'drain_lifecycle')
    expect(lifecycles.every((c) => c[1]?.cooldownTimestampMutated === false)).toBe(true)
  })

  it('does not advance cooldown when geocodePendingSales throws', async () => {
    const env = process.env as Record<string, string | undefined>
    const { maybeRunPreviewBacklogDrain, __resetPreviewBacklogDrainStateForTests } = await import(
      '@/lib/ingestion/previewBacklogDrain'
    )
    __resetPreviewBacklogDrainStateForTests()
    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'preview'
    hoisted.geocodePendingSales
      .mockRejectedValueOnce(new Error('geocode failed'))
      .mockResolvedValueOnce({
        claimed: 1,
        succeeded: 1,
        failedRetriable: 0,
        failedTerminal: 0,
        rate429Count: 0,
        processed: 1,
        publishTriggered: 0,
        publishOk: 0,
        publishFailed: 0,
        claimedRowIds: ['a'],
      })

    const r1 = await maybeRunPreviewBacklogDrain('test')
    const r2 = await maybeRunPreviewBacklogDrain('test')

    expect(r1.status).toBe('error')
    expect(r2.status).toBe('completed')
    expect(hoisted.geocodePendingSales).toHaveBeenCalledTimes(2)
    const cooldownSkips = hoisted.loggerInfo.mock.calls.filter(
      (c) => c[1]?.operation === 'cooldown_skip'
    )
    expect(cooldownSkips.length).toBe(0)
  })
})

