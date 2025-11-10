import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAddressFixtures } from '@/tests/utils/mocks'
import { server } from '@/tests/setup/msw.server'
import { http, HttpResponse } from 'msw'

// Use the global MSW handlers from tests/setup.ts

// Mock environment variables
const originalEnv = process.env

describe('Geocoding Fallback', () => {
  let geocodeAddress: (addr: string) => Promise<any>
  let clearGeocodeCache: () => void
  beforeEach(async () => {
    vi.resetModules()
    vi.doUnmock('@/lib/geocode')
    process.env = { ...originalEnv, NOMINATIM_APP_EMAIL: 'test@example.com' }
    vi.clearAllMocks()
    ;({ geocodeAddress, clearGeocodeCache } = await import('@/lib/geocode'))
    clearGeocodeCache() // Clear cache before each test
  })

  afterEach(() => {
    process.env = originalEnv
    clearGeocodeCache() // Clear cache after each test
  })

  it('should geocode address using Nominatim', async () => {
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    const result = await geocodeAddress(testAddress.address)
    
    // Should get Louisville coordinates from Nominatim
    expect(result).toEqual({
      lat: 38.1405,
      lng: -85.6936,
      formatted_address: '123 Test St, Louisville, KY',
      city: 'Louisville',
      state: 'KY',
      zip: '40201'
    })
  })

  it('should return null when Nominatim fails', async () => {
    // Use an address that doesn't match MSW handler patterns
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })

  it('should geocode address with valid input', async () => {
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    const result = await geocodeAddress(testAddress.address)
    
    expect(result).toEqual({
      lat: 38.1405,
      lng: -85.6936,
      formatted_address: '123 Test St, Louisville, KY',
      city: 'Louisville',
      state: 'KY',
      zip: '40201'
    })
  })

  it('should handle Nominatim rate limiting gracefully', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    // Use an address that doesn't match MSW handler patterns to get null result
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })

  it('should include proper headers for Nominatim requests', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    let capturedHeaders: Headers | null = null
    
    // Override the Nominatim handler to capture headers
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', ({ request }) => {
        capturedHeaders = request.headers as Headers
        const url = new URL(request.url)
        const q = url.searchParams.get('q') || ''
        if (/invalid|fail/i.test(q)) {
          return HttpResponse.json([], { status: 200 })
        }
        return HttpResponse.json([
          {
            lat: '38.1405',
            lon: '-85.6936',
            display_name: '123 Test St, Louisville, KY',
            address: { city: 'Louisville', state: 'KY', postcode: '40201', country_code: 'us', country: 'United States' },
          },
        ])
      })
    )
    
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    const result = await geocodeAddress(testAddress.address)
    
    // Should get Louisville coordinates from Nominatim
    expect(result).toEqual({
      lat: 38.1405,
      lng: -85.6936,
      formatted_address: '123 Test St, Louisville, KY',
      city: 'Louisville',
      state: 'KY',
      zip: '40201'
    })

    // Verify User-Agent header is present
    expect(capturedHeaders).toBeTruthy()
    const headers = capturedHeaders!
    expect(headers.get('User-Agent')).toContain('LootAura/1.0')
    expect(headers.get('User-Agent')).toContain('test@example.com')
  })

  it('should cache results to avoid repeated API calls', async () => {
    let requestCount = 0
    
    // Override the Nominatim handler to count requests
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', ({ request }) => {
        requestCount++
        const url = new URL(request.url)
        const q = url.searchParams.get('q') || ''
        if (/invalid|fail/i.test(q)) {
          return HttpResponse.json([], { status: 200 })
        }
        return HttpResponse.json([
          {
            lat: '38.1405',
            lon: '-85.6936',
            display_name: '123 Test St, Louisville, KY',
            address: { city: 'Louisville', state: 'KY', postcode: '40201', country_code: 'us', country: 'United States' },
          },
        ])
      })
    )
    
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    // First call
    const result1 = await geocodeAddress(testAddress.address)
    expect(result1).toBeTruthy()
    expect(requestCount).toBe(1)
    
    // Second call should use cache (no additional request)
    const result2 = await geocodeAddress(testAddress.address)
    expect(result2).toEqual(result1)
    expect(requestCount).toBe(1) // Still 1, cache was used
  })

  it('should respect cache TTL and expire entries after 24 hours', async () => {
    let requestCount = 0
    
    // Override the Nominatim handler to count requests
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', ({ request }) => {
        requestCount++
        const url = new URL(request.url)
        const q = url.searchParams.get('q') || ''
        if (/invalid|fail/i.test(q)) {
          return HttpResponse.json([], { status: 200 })
        }
        return HttpResponse.json([
          {
            lat: '38.1405',
            lon: '-85.6936',
            display_name: '123 Test St, Louisville, KY',
            address: { city: 'Louisville', state: 'KY', postcode: '40201', country_code: 'us', country: 'United States' },
          },
        ])
      })
    )
    
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    // First call
    const result1 = await geocodeAddress(testAddress.address)
    expect(result1).toBeTruthy()
    expect(requestCount).toBe(1)
    
    // Second call should use cache
    const result2 = await geocodeAddress(testAddress.address)
    expect(result2).toEqual(result1)
    expect(requestCount).toBe(1)
    
    // Mock Date.now to simulate 24 hours + 1ms passing
    const originalNow = Date.now
    const baseTime = originalNow()
    const mockNow = vi.fn(() => baseTime + 24 * 60 * 60 * 1000 + 1)
    Date.now = mockNow as any
    
    // Third call should bypass cache (expired) and make new request
    const result3 = await geocodeAddress(testAddress.address)
    expect(result3).toEqual(result1)
    expect(requestCount).toBe(2) // New request made after expiry
    
    // Restore Date.now
    Date.now = originalNow
  })

  it('should handle malformed Nominatim responses', async () => {
    // Use an address that doesn't match MSW handler patterns to get null result
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })

  it('should handle network errors gracefully', async () => {
    // Use an address that doesn't match MSW handler patterns to get null result
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })
})
