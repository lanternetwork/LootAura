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
    expect(result).toMatchObject({ coords: { lat: 38.25, lng: -85.75 }, hit429: false })
    const fetchCall = vi.mocked(fetch).mock.calls[0]?.[0]
    expect(String(fetchCall)).toContain('countrycodes=us')
    expect(String(fetchCall)).toContain('addressdetails=1')
    expect(String(fetchCall)).toContain('limit=3')
    expect(String(fetchCall)).toContain('100%20Main%20St%2C%20Louisville%2C%20KY%2C%20USA')
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  it('builds residential query with unit + zip context (does not drop apartment detail)', async () => {
    vi.resetModules()
    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    await geocodeAddress({
      address: '742 Evergreen Terrace, Apt 2B, 62704',
      city: 'Springfield',
      state: 'IL',
    })
    const fetchCall = vi.mocked(fetch).mock.calls[0]?.[0]
    expect(String(fetchCall)).toContain(
      '742%20Evergreen%20Terrace%2C%20Apt%202B%2C%20Springfield%2C%20IL%2C%2062704%2C%20USA'
    )
  })

  it('strips trailing city/state/zip context duplicated in the street token', async () => {
    vi.resetModules()
    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    await geocodeAddress({
      address: '1234 Maple Hill Dr Denver CO 80211',
      city: 'Denver',
      state: 'CO',
    })
    const fetchCall = vi.mocked(fetch).mock.calls[0]?.[0]
    expect(String(fetchCall)).toContain('1234%20Maple%20Hill%20Dr%2C%20Denver%2C%20CO%2C%2080211%2C%20USA')
    expect(String(fetchCall)).not.toContain('Denver%20CO%2080211%2C%20Denver%2C%20CO%2C%2080211')
  })

  it('strips trailing comma-delimited city/state context from address_raw-like inputs', async () => {
    vi.resetModules()
    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    await geocodeAddress({
      address: '55 Oak Ln, Springfield, IL 62704',
      city: 'Springfield',
      state: 'IL',
    })
    const fetchCall = vi.mocked(fetch).mock.calls[0]?.[0]
    expect(String(fetchCall)).toContain('55%20Oak%20Ln%2C%20Springfield%2C%20IL%2C%2062704%2C%20USA')
    expect(String(fetchCall)).not.toContain('Springfield%2C%20IL%2062704%2C%20Springfield')
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

      expect(result).toMatchObject({ coords: null, hit429: true, noCoordsReason: 'rate_limited' })
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

    expect(result).toMatchObject({
      coords: null,
      hit429: false,
      noCoordsReason: 'http_not_ok',
      httpStatus: 503,
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      'Nominatim geocode request failed (non-OK response)',
      expect.objectContaining({
        status: 503,
      })
    )
  })

  it('returns empty_results when Nominatim returns no matches', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
    )

    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    const result = await geocodeAddress({
      address: '100 Main St',
      city: 'Louisville',
      state: 'KY',
    })

    expect(result).toMatchObject({ coords: null, hit429: false, noCoordsReason: 'empty_results' })
  })

  it('classifies soft rate limiting when empty results include retry headers', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'retry-after' ? '2' : null),
        },
        json: async () => [],
      })
    )

    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    const result = await geocodeAddress({
      address: '100 Main St',
      city: 'Louisville',
      state: 'KY',
    })

    expect(result).toMatchObject({ coords: null, hit429: true, noCoordsReason: 'rate_limited_soft' })
  })

  it('classifies broad/low-confidence provider matches as no-coords', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [
          {
            lat: '38.25',
            lon: '-85.75',
            importance: 0.05,
            addresstype: 'city',
            class: 'boundary',
            type: 'administrative',
            address: { city: 'Louisville', state: 'Kentucky' },
          },
        ],
      })
    )

    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    const result = await geocodeAddress({
      address: '100 Main St',
      city: 'Louisville',
      state: 'KY',
    })

    expect(result).toMatchObject({ coords: null, hit429: false, noCoordsReason: 'low_confidence' })
  })

  it('classifies city/state mismatch as low_confidence with explicit reasons', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [
          {
            lat: '40.7128',
            lon: '-74.0060',
            importance: 0.7,
            addresstype: 'house',
            class: 'building',
            type: 'house',
            address: { city: 'Jersey City', state: 'New Jersey' },
          },
        ],
      })
    )
    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    const result = await geocodeAddress({
      address: '123 Example St',
      city: 'New York',
      state: 'NY',
    })
    expect(result).toMatchObject({
      coords: null,
      hit429: false,
      noCoordsReason: 'low_confidence',
      lowConfidenceReasons: expect.arrayContaining(['city_mismatch', 'state_mismatch']),
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      'Nominatim returned low-confidence geocode candidate',
      expect.objectContaining({
        component: 'geocode/geocodeAddress',
        operation: 'nominatim_classify',
      })
    )
  })

  it('retries replay identical failing query fingerprints for identical input', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [],
      })
    )
    const { geocodeAddress } = await import('@/lib/geocode/geocodeAddress')
    const one = await geocodeAddress({
      address: '11 Oak Ridge Ct, Unit 5, 98052',
      city: 'Redmond',
      state: 'WA',
    })
    const two = await geocodeAddress({
      address: '11 Oak Ridge Ct, Unit 5, 98052',
      city: 'Redmond',
      state: 'WA',
    })
    expect(one.noCoordsReason).toBe('empty_results')
    expect(two.noCoordsReason).toBe('empty_results')
    expect(one.queryFingerprint).toBeTruthy()
    expect(one.queryFingerprint).toBe(two.queryFingerprint)
  })
})
