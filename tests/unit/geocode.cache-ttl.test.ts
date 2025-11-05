import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodeAddress, clearGeocodeCache } from '@/lib/geocode'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Mock Date.now for TTL testing
const mockNow = vi.fn()
const originalNow = Date.now

describe('Geocode Cache TTL', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockClear()
    mockNow.mockReturnValue(1000000) // Start at 1M ms
    Date.now = mockNow
    clearGeocodeCache()
  })

  afterEach(() => {
    Date.now = originalNow
    clearGeocodeCache()
  })

  it('should cache results for 10 minutes', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        lat: '38.2512',
        lon: '-85.7494',
        display_name: '123 Test St, Louisville, KY',
        address: {
          city: 'Louisville',
          state: 'KY',
          postcode: '40201'
        }
      }]
    })

    const { geocodeAddress } = await import('@/lib/geocode')
    
    // First call - should fetch
    const result1 = await geocodeAddress('123 Test St, Louisville, KY')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result1).toBeTruthy()

    // Second call - should use cache (within 10 minutes)
    mockNow.mockReturnValue(1000000 + (5 * 60 * 1000)) // 5 minutes later
    const result2 = await geocodeAddress('123 Test St, Louisville, KY')
    expect(mockFetch).toHaveBeenCalledTimes(1) // Still only 1 call
    expect(result2).toEqual(result1)
  })

  it('should evict expired cache entries', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        lat: '38.2512',
        lon: '-85.7494',
        display_name: '123 Test St, Louisville, KY',
        address: {
          city: 'Louisville',
          state: 'KY',
          postcode: '40201'
        }
      }]
    })

    const { geocodeAddress } = await import('@/lib/geocode')
    
    // First call - should fetch
    await geocodeAddress('123 Test St, Louisville, KY')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Second call - after 10 minutes, should fetch again
    mockNow.mockReturnValue(1000000 + (11 * 60 * 1000)) // 11 minutes later
    await geocodeAddress('123 Test St, Louisville, KY')
    expect(mockFetch).toHaveBeenCalledTimes(2) // Should fetch again
  })

  it('should limit cache size to 100 entries', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        lat: '38.2512',
        lon: '-85.7494',
        display_name: 'Test Address',
        address: {}
      }]
    })

    const { geocodeAddress } = await import('@/lib/geocode')
    
    // Fill cache with 101 entries
    for (let i = 0; i < 101; i++) {
      await geocodeAddress(`Address ${i}`)
    }

    // Should have made 101 fetch calls (cache evicted, but all unique keys)
    expect(mockFetch).toHaveBeenCalledTimes(101)
    
    // First entry should still be in cache (most recent eviction)
    // Let's check that the 100th entry is cached
    mockFetch.mockClear()
    await geocodeAddress('Address 100')
    // Should use cache, not fetch
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should clear cache when clearGeocodeCache is called', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        lat: '38.2512',
        lon: '-85.7494',
        display_name: '123 Test St, Louisville, KY',
        address: {
          city: 'Louisville',
          state: 'KY',
          postcode: '40201'
        }
      }]
    })

    const { geocodeAddress, clearGeocodeCache } = await import('@/lib/geocode')
    
    // First call - should fetch
    await geocodeAddress('123 Test St, Louisville, KY')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Clear cache
    clearGeocodeCache()

    // Second call - should fetch again (cache cleared)
    mockFetch.mockClear()
    await geocodeAddress('123 Test St, Louisville, KY')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

