import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  getNominatimEmail: () => 'test-nominatim@example.com',
}))

const loggerError = vi.fn()
const loggerWarn = vi.fn()

vi.mock('@/lib/log', () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('geocodeAddress (ingestion Nominatim)', () => {
  beforeEach(() => {
    loggerError.mockClear()
    loggerWarn.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ lat: '38.25', lon: '-85.75' }],
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns coordinates on success', async () => {
    vi.resetModules()
    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    const result = await geocodeAddress({
      address: '100 Main St',
      city: 'Louisville',
      state: 'KY',
    })
    expect(result).toEqual({ coords: { lat: 38.25, lng: -85.75 }, hit429: false })
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  it('returns null on HTTP 429, logs rate limit, and applies backoff', async () => {
    vi.useFakeTimers()
    try {
      vi.resetModules()
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      })
      vi.stubGlobal('fetch', fetchMock)

      const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
      const promise = geocodeAddress({
        address: '100 Main St',
        city: 'Louisville',
        state: 'KY',
      })

      await vi.advanceTimersByTimeAsync(300)
      const result = await promise

      expect(result).toEqual({ coords: null, hit429: true })
      expect(loggerWarn).toHaveBeenCalledWith(
        'Nominatim rate limited (HTTP 429); treating as retriable geocode failure',
        expect.objectContaining({
          component: 'geocode/geocodeAddress',
          operation: 'nominatim_fetch',
          status: 429,
        })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns null on other non-OK responses and logs status', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    )

    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    const result = await geocodeAddress({
      address: '100 Main St',
      city: 'Louisville',
      state: 'KY',
    })

    expect(result).toEqual({ coords: null, hit429: false })
    expect(loggerWarn).toHaveBeenCalledWith(
      'Nominatim geocode request failed (non-OK response)',
      expect.objectContaining({
        status: 503,
      })
    )
  })
})
