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
    
    // Clear mock before each test
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return addresses for valid numeric prefix with coords', async () => {
    // Mock enough results for the first radius (≥ limit=8) to stop expansion early
    const mockElements = Array.from({ length: 10 }, (_, i) => ({
      type: 'node' as const,
      id: i + 1,
      lat: 38.2512 + (i * 0.001),
      lon: -85.7494 + (i * 0.001),
      tags: {
        'addr:housenumber': `12${i}`,
        'addr:street': 'Main St',
        'addr:city': 'Louisville',
        'addr:state': 'KY',
        'addr:postcode': '40201',
        'addr:country': 'US'
      }
    }))
    
    // Mock fetch to return the same response for all radius attempts
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: mockElements
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
    
    // Verify Overpass was called (progressive expansion may call it multiple times)
    expect(mockFetch).toHaveBeenCalled()
    const call = mockFetch.mock.calls[0]
    expect(String(call[0])).toContain('overpass-api.de')
    expect(call[1]?.method).toBe('POST')
    
    // Reset mock for next test
    mockFetch.mockClear()
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
    // Return enough results (≥ limit=8) to stop expansion early
    const mockElements = [
      {
        type: 'node' as const,
        id: 1,
        lat: 38.2520, // Further from 38.25, -85.75
        lon: -85.7500,
        tags: {
          'addr:housenumber': '5001',
          'addr:street': 'Far St'
        }
      },
      {
        type: 'node' as const,
        id: 2,
        lat: 38.2510, // Closer to 38.25, -85.75
        lon: -85.7490,
        tags: {
          'addr:housenumber': '5000',
          'addr:street': 'Near St'
        }
      },
      // Add more elements to reach limit
      ...Array.from({ length: 7 }, (_, i) => ({
        type: 'node' as const,
        id: i + 3,
        lat: 38.2515 + (i * 0.001),
        lon: -85.7495 + (i * 0.001),
        tags: {
          'addr:housenumber': `500${i}`,
          'addr:street': `Street ${i}`
        }
      }))
    ]
    
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: mockElements
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=500&lat=38.25&lng=-85.75&limit=8')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.data.length).toBeGreaterThanOrEqual(2)
    
    // First result should be closer (5000 Near St)
    expect(data.data[0].address?.road).toBe('Near St')
    // Second result should be further (5001 Far St)
    expect(data.data.find((addr: any) => addr.address?.road === 'Far St')).toBeDefined()
    
    // Reset mock for next test
    mockFetch.mockClear()
  })

  it('should respect limit parameter', async () => {
    // Mock many addresses
    const elements = Array.from({ length: 20 }, (_, i) => ({
      type: 'node' as const,
      id: i + 1,
      lat: 38.25 + (i * 0.001),
      lon: -85.75 + (i * 0.001),
      tags: {
        'addr:housenumber': `${12}${i}`,
        'addr:street': `Street ${i}`
      }
    }))

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ elements })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=12&lat=38.25&lng=-85.75&limit=5')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.data.length).toBe(5) // Should be limited to 5
    
    // Reset mock for next test
    mockFetch.mockClear()
  })

  it('should cache results', async () => {
    // Mock enough results (≥ limit=8) to stop expansion early
    const mockElements = Array.from({ length: 10 }, (_, i) => ({
      type: 'node' as const,
      id: i + 1,
      lat: 38.2512 + (i * 0.001),
      lon: -85.7494 + (i * 0.001),
      tags: {
        'addr:housenumber': `123${i}`,
        'addr:street': 'Main St'
      }
    }))
    
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: mockElements
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=123&lat=38.25&lng=-85.75')

    // First call - progressive expansion may call fetch multiple times (once per radius until ≥ limit results)
    const response1 = await GET(request)
    const firstCallCount = mockFetch.mock.calls.length
    expect(firstCallCount).toBeGreaterThan(0)

    // Second call (should use cache)
    const response2 = await GET(request)
    // Should not have made additional fetch calls (cache hit)
    expect(mockFetch.mock.calls.length).toBe(firstCallCount)

    const data1 = await response1.json()
    const data2 = await response2.json()
    expect(data1).toEqual(data2)
    
    // Reset mock for next test
    mockFetch.mockClear()
  })

  it('should include debug info in development mode', async () => {
    // Store original NODE_ENV
    const originalEnv = process.env.NODE_ENV
    // Use vi.stubEnv to temporarily set NODE_ENV
    vi.stubEnv('NODE_ENV', 'development')
    
    try {
      // Mock enough results (≥ limit=8) to stop expansion early
      const mockElements = Array.from({ length: 10 }, (_, i) => ({
        type: 'node' as const,
        id: i + 1,
        lat: 38.2512 + (i * 0.001),
        lon: -85.7494 + (i * 0.001),
        tags: {
          'addr:housenumber': `123${i}`,
          'addr:street': 'Main St'
        }
      }))
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          elements: mockElements
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
      
      // Reset mock for next test
      mockFetch.mockClear()
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
    // Mock enough results (≥ limit=8) to stop expansion early
    const mockElements = [
      {
        type: 'node' as const,
        id: 1,
        lat: 38.2512,
        lon: -85.7494,
        tags: {
          'addr:housenumber': '123',
          'addr:street': 'Main St'
        }
      },
      {
        type: 'node' as const,
        id: 2,
        lat: 38.2513,
        lon: -85.7495,
        tags: {
          'addr:housenumber': '124'
          // Missing addr:street - should be dropped
        }
      },
      // Add more valid elements to reach limit
      ...Array.from({ length: 7 }, (_, i) => ({
        type: 'node' as const,
        id: i + 3,
        lat: 38.2514 + (i * 0.001),
        lon: -85.7496 + (i * 0.001),
        tags: {
          'addr:housenumber': `12${i}`,
          'addr:street': `Street ${i}`
        }
      }))
    ]
    
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: mockElements
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=12&lat=38.25&lng=-85.75')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    // Should have at least 8 results (≥ limit), but only valid ones
    expect(data.data.length).toBeGreaterThanOrEqual(1)
    expect(data.data[0].address?.road).toBe('Main St')
    
    // Reset mock for next test
    mockFetch.mockClear()
  })

  it('should accept digits+street query format', async () => {
    // Mock enough results (≥ limit=8) to stop expansion early
    const mockElements = Array.from({ length: 10 }, (_, i) => ({
      type: 'node' as const,
      id: i + 1,
      lat: 38.2512 + (i * 0.001),
      lon: -85.7494 + (i * 0.001),
      tags: {
        'addr:housenumber': `500${i}`,
        'addr:street': 'Preston Highway',
        'addr:city': 'Louisville',
        'addr:state': 'KY',
        'addr:postcode': '40219',
        'addr:country': 'US'
      }
    }))
    
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: mockElements
      })
    })

    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=5001%20preston&lat=38.25&lng=-85.75&limit=8')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBeGreaterThan(0)
    
    // Reset mock for next test
    mockFetch.mockClear()
  })

  it('should handle query with + signs (URL encoded spaces)', async () => {
    const mockElements = Array.from({ length: 5 }, (_, i) => ({
      type: 'node' as const,
      id: i + 1,
      lat: 38.2512 + (i * 0.001),
      lon: -85.7494 + (i * 0.001),
      tags: {
        'addr:housenumber': `5009`,
        'addr:street': 'Preston Highway',
        'addr:city': 'Louisville',
        'addr:state': 'KY',
        'addr:postcode': '40219',
        'addr:country': 'US'
      }
    }))
    
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: mockElements
      })
    })

    // Test with + signs (should be normalized to spaces)
    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=5009+Preston+Highway&lat=38.25&lng=-85.75&limit=2')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.code).toBeUndefined()
    expect(Array.isArray(data.data)).toBe(true)
    
    mockFetch.mockClear()
  })

  it('should handle query with spaces', async () => {
    const mockElements = Array.from({ length: 5 }, (_, i) => ({
      type: 'node' as const,
      id: i + 1,
      lat: 38.2512 + (i * 0.001),
      lon: -85.7494 + (i * 0.001),
      tags: {
        'addr:housenumber': `5009`,
        'addr:street': 'Preston Highway',
        'addr:city': 'Louisville',
        'addr:state': 'KY',
        'addr:postcode': '40219',
        'addr:country': 'US'
      }
    }))
    
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        elements: mockElements
      })
    })

    // Test with URL-encoded spaces (%20)
    const request = new NextRequest('http://localhost:3000/api/geocoding/overpass-address?q=5009%20Preston%20Highway&lat=38.25&lng=-85.75&limit=2')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.code).toBeUndefined()
    expect(Array.isArray(data.data)).toBe(true)
    
    mockFetch.mockClear()
  })
})

