import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/geocoding/overpass-address/route'

// Mock rate limiter
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler
}))

describe('Overpass Address Route Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    process.env.OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter'
    process.env.OVERPASS_TIMEOUT_MS = '8000'
    process.env.OVERPASS_RADIUS_M = '5000'
    
    // Clear cache
    if ((globalThis as any).__clearOverpassCache) {
      (globalThis as any).__clearOverpassCache()
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return addresses for valid numeric prefix with coords', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 123,
            lat: 38.2512,
            lon: -85.7494,
            tags: {
              'addr:housenumber': '123',
              'addr:street': 'Main St',
              'addr:city': 'Louisville',
              'addr:state': 'KY',
              'addr:postcode': '40201',
              'addr:country': 'US'
            }
          },
          {
            type: 'way',
            id: 456,
            center: {
              lat: 38.2520,
              lon: -85.7500
            },
            tags: {
              'addr:housenumber': '124',
              'addr:street': 'Main St',
              'addr:city': 'Louisville',
              'addr:state': 'KY',
              'addr:postcode': '40201'
            }
          }
        ]
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=12&lat=38.25&lng=-85.75&limit=8')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBeGreaterThan(0)
    expect(data.data[0]).toHaveProperty('id')
    expect(data.data[0]).toHaveProperty('label')
    expect(data.data[0]).toHaveProperty('lat')
    expect(data.data[0]).toHaveProperty('lng')
    expect(data.data[0]).toHaveProperty('address')
    
    // Verify Overpass was called
    expect(mockFetch).toHaveBeenCalled()
    const call = mockFetch.mock.calls[0]
    expect(String(call[0])).toContain('overpass-api.de')
    expect(call[1]?.method).toBe('POST')
  })

  it('should return 400 for invalid query (non-numeric, non-digits+street)', async () => {
    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=abc&lat=38.25&lng=-85.75')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_QUERY')
  })

  it('should return 400 for missing coordinates', async () => {
    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=123')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('NO_COORDS')
  })

  it('should return 400 for numeric-only query longer than 6 digits', async () => {
    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=1234567&lat=38.25&lng=-85.75')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_QUERY')
  })

  it('should handle Overpass 429 rate limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'rate limit' })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=123&lat=38.25&lng=-85.75')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('OVERPASS_UNAVAILABLE')
  })

  it('should sort results by distance (closest first)', async () => {
    // Mock two addresses at different distances
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 1,
            lat: 38.2520, // Further from 38.25, -85.75
            lon: -85.7500,
            tags: {
              'addr:housenumber': '5001',
              'addr:street': 'Far St'
            }
          },
          {
            type: 'node',
            id: 2,
            lat: 38.2510, // Closer to 38.25, -85.75
            lon: -85.7490,
            tags: {
              'addr:housenumber': '5000',
              'addr:street': 'Near St'
            }
          }
        ]
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=500&lat=38.25&lng=-85.75&limit=8')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.data.length).toBe(2)
    
    // First result should be closer (5000 Near St)
    expect(data.data[0].address?.road).toBe('Near St')
    expect(data.data[1].address?.road).toBe('Far St')
  })

  it('should respect limit parameter', async () => {
    // Mock many addresses
    const elements = Array.from({ length: 20 }, (_, i) => ({
      type: 'node',
      id: i + 1,
      lat: 38.25 + (i * 0.001),
      lon: -85.75 + (i * 0.001),
      tags: {
        'addr:housenumber': `${12}${i}`,
        'addr:street': `Street ${i}`
      }
    }))

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ elements })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=12&lat=38.25&lng=-85.75&limit=5')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.data.length).toBe(5) // Should be limited to 5
  })

  it('should cache results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 123,
            lat: 38.2512,
            lon: -85.7494,
            tags: {
              'addr:housenumber': '123',
              'addr:street': 'Main St'
            }
          }
        ]
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=123&lat=38.25&lng=-85.75')

    // First call
    const response1 = await GET(request)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Second call (should use cache)
    const response2 = await GET(request)
    expect(mockFetch).toHaveBeenCalledTimes(1) // Still only 1 call

    const data1 = await response1.json()
    const data2 = await response2.json()
    expect(data1).toEqual(data2)
  })

  it('should include debug info in development mode', async () => {
    // Store original NODE_ENV
    const originalEnv = process.env.NODE_ENV
    // Use vi.stubEnv to temporarily set NODE_ENV
    vi.stubEnv('NODE_ENV', 'development')
    
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: 'node',
              id: 123,
              lat: 38.2512,
              lon: -85.7494,
              tags: {
                'addr:housenumber': '123',
                'addr:street': 'Main St'
              }
            }
          ]
        })
      })

      const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=123&lat=38.25&lng=-85.75&_debug=1')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data._debug).toBeDefined()
      expect(data._debug).toHaveProperty('mode')
      expect(data._debug).toHaveProperty('cacheHit')
      expect(data._debug).toHaveProperty('radiusUsedM')
      expect(data._debug).toHaveProperty('countRaw')
      expect(data._debug).toHaveProperty('countNormalized')
      expect(data._debug).toHaveProperty('coords')
      expect(data._debug).toHaveProperty('radiiTriedM')
      expect(data._debug).toHaveProperty('distancesM')
    } finally {
      // Restore original NODE_ENV
      if (originalEnv !== undefined) {
        vi.stubEnv('NODE_ENV', originalEnv)
      } else {
        // If it was undefined, just set it back to 'test' (default test env)
        vi.stubEnv('NODE_ENV', 'test')
      }
    }
  })

  it('should drop elements missing required fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 1,
            lat: 38.2512,
            lon: -85.7494,
            tags: {
              'addr:housenumber': '123',
              'addr:street': 'Main St'
            }
          },
          {
            type: 'node',
            id: 2,
            lat: 38.2513,
            lon: -85.7495,
            tags: {
              'addr:housenumber': '124'
              // Missing addr:street - should be dropped
            }
          }
        ]
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=12&lat=38.25&lng=-85.75')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.data.length).toBe(1) // Only the valid one
    expect(data.data[0].address?.road).toBe('Main St')
  })

  it('should accept digits+street query format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 123,
            lat: 38.2512,
            lon: -85.7494,
            tags: {
              'addr:housenumber': '5001',
              'addr:street': 'Preston Highway',
              'addr:city': 'Louisville',
              'addr:state': 'KY',
              'addr:postcode': '40219',
              'addr:country': 'US'
            }
          }
        ]
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=5001%20preston&lat=38.25&lng=-85.75&limit=8')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBeGreaterThan(0)
  })
})

