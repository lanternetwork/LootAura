import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/setup/msw.server'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/geocoding/suggest/route'

// Mock rate limiter to bypass rate limiting in tests
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler
}))

describe('Suggest Route Integration', () => {
  beforeEach(() => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
  })

  it('should return suggestions for valid query', async () => {
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async () => {
        return HttpResponse.json([
          {
            place_id: 123,
            display_name: '123 Main St, Louisville, KY',
            lat: '38.2512',
            lon: '-85.7494',
            address: {
              house_number: '123',
              road: 'Main St',
              city: 'Louisville',
              state: 'KY',
              postcode: '40201',
              country: 'US'
            }
          }
        ])
      })
    )

    const request = new NextRequest('http://localhost:3000/api/geocoding/suggest?q=123%20Main%20St')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBe(1)
    expect(data.data[0]).toMatchObject({
      id: '123',
      label: '123 Main St, Louisville, KY',
      lat: 38.2512,
      lng: -85.7494,
      address: expect.objectContaining({
        houseNumber: '123',
        road: 'Main St',
        city: 'Louisville',
        state: 'KY',
        postcode: '40201'
      })
    })
  })

  it('should return 400 for query less than 3 characters', async () => {
    const request = new NextRequest('http://localhost:3000/api/geocoding/suggest?q=ab')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.error).toContain('at least 3 characters')
  })

  it('should handle 429 rate limit with retry-after', async () => {
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async () => {
        return HttpResponse.json(
          { error: 'Rate limit exceeded' },
          { 
            status: 429,
            headers: {
              'Retry-After': '60'
            }
          }
        )
      })
    )

    const request = new NextRequest('http://localhost:3000/api/geocoding/suggest?q=123%20Main%20St')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(data.ok).toBe(false)
    expect(data.error).toContain('Rate limit exceeded')
    expect(data.retryAfter).toBe(60)
    expect(response.headers.get('Retry-After')).toBe('60')
  })

  it('should normalize Nominatim response to AddressSuggestion format', async () => {
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async () => {
        return HttpResponse.json([
          {
            place_id: 456,
            display_name: 'Test Address',
            lat: '40.0',
            lon: '-80.0',
            address: {
              city: 'Test City',
              state: 'TS',
              postcode: '12345'
            }
          }
        ])
      })
    )

    const request = new NextRequest('http://localhost:3000/api/geocoding/suggest?q=test')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBe(1)
    expect(data.data[0]).toHaveProperty('id')
    expect(data.data[0]).toHaveProperty('label')
    expect(data.data[0]).toHaveProperty('lat')
    expect(data.data[0]).toHaveProperty('lng')
    expect(data.data[0]).toHaveProperty('address')
  })

  it('should cache suggestions for 60 seconds', async () => {
    let callCount = 0
    
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async () => {
        callCount++
        return HttpResponse.json([
          {
            place_id: 789,
            display_name: 'Cached Address',
            lat: '38.0',
            lon: '-85.0',
            address: {}
          }
        ])
      })
    )

    const request = new NextRequest('http://localhost:3000/api/geocoding/suggest?q=cached')
    
    // First call
    const response1 = await GET(request)
    expect(callCount).toBe(1)

    // Second call (within 60s) - should use cache
    const response2 = await GET(request)
    expect(callCount).toBe(1) // Still only 1 call
    
    const data1 = await response1.json()
    const data2 = await response2.json()
    expect(data1).toEqual(data2)
  })

  it('should include User-Agent header in Nominatim request', async () => {
    let capturedUserAgent: string | null = null
    
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async ({ request }) => {
        capturedUserAgent = request.headers.get('user-agent')
        return HttpResponse.json([])
      })
    )

    const request = new NextRequest('http://localhost:3000/api/geocoding/suggest?q=test')
    await GET(request)

    expect(capturedUserAgent).toBe('LootAura/1.0 (test@example.com)')
  })
})
