import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/setup/msw.server'
import { geocodeAddress, clearGeocodeCache } from '@/lib/geocode'

// Track fetch calls
let fetchCallCount = 0

describe('Geocode Cache TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    fetchCallCount = 0
    clearGeocodeCache()
    
    // Set up MSW handler that tracks calls
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async () => {
        fetchCallCount++
        return HttpResponse.json([{
          lat: '38.2512',
          lon: '-85.7494',
          display_name: '123 Test St, Louisville, KY',
          address: {
            city: 'Louisville',
            state: 'KY',
            postcode: '40201'
          }
        }])
      })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    clearGeocodeCache()
    fetchCallCount = 0
  })

  it('should cache results for 10 minutes', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    // Re-import to get fresh module
    const { geocodeAddress: geocode } = await import('@/lib/geocode')
    clearGeocodeCache()
    
    // First call - should fetch
    const result1 = await geocode('123 Test St, Louisville, KY')
    expect(fetchCallCount).toBe(1)
    expect(result1).toBeTruthy()

    // Second call - should use cache (within 10 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000) // 5 minutes later
    const result2 = await geocode('123 Test St, Louisville, KY')
    expect(fetchCallCount).toBe(1) // Still only 1 call
    expect(result2).toEqual(result1)
  })

  it('should evict expired cache entries', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    const { geocodeAddress: geocode } = await import('@/lib/geocode')
    clearGeocodeCache()
    
    // First call - should fetch
    await geocode('123 Test St, Louisville, KY')
    expect(fetchCallCount).toBe(1)

    // Second call - after 10 minutes, should fetch again
    vi.advanceTimersByTime(11 * 60 * 1000) // 11 minutes later
    await geocode('123 Test St, Louisville, KY')
    expect(fetchCallCount).toBe(2) // Should fetch again
  })

  it('should limit cache size to 100 entries', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    // Set up handler for multiple addresses
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async ({ request }) => {
        fetchCallCount++
        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        return HttpResponse.json([{
          lat: '38.2512',
          lon: '-85.7494',
          display_name: query || 'Test Address',
          address: {}
        }])
      })
    )
    
    const { geocodeAddress: geocode } = await import('@/lib/geocode')
    clearGeocodeCache()
    
    // Fill cache with 101 entries
    for (let i = 0; i < 101; i++) {
      await geocode(`Address ${i}`)
    }

    // Should have made 101 fetch calls (cache evicted, but all unique keys)
    expect(fetchCallCount).toBe(101)
    
    // The 100th entry should still be in cache (most recent eviction)
    // Let's check that the 100th entry is cached
    fetchCallCount = 0
    await geocode('Address 100')
    // Should use cache, not fetch
    expect(fetchCallCount).toBe(0)
  })

  it('should clear cache when clearGeocodeCache is called', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    const { geocodeAddress: geocode, clearGeocodeCache: clear } = await import('@/lib/geocode')
    clear()
    
    // First call - should fetch
    await geocode('123 Test St, Louisville, KY')
    expect(fetchCallCount).toBe(1)

    // Clear cache
    clear()

    // Second call - should fetch again (cache cleared)
    fetchCallCount = 0
    await geocode('123 Test St, Louisville, KY')
    expect(fetchCallCount).toBe(1)
  })
})
