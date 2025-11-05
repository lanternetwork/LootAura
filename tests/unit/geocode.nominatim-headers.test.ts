import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock process.env
const originalEnv = process.env

describe('Nominatim Headers', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    // Use vi.stubGlobal to properly mock fetch for module imports
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('should include User-Agent header in Nominatim requests', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    mockFetch.mockResolvedValueOnce({
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

    // Re-import to get fresh module with env and mocked fetch
    const { geocodeAddress, clearGeocodeCache } = await import('@/lib/geocode')
    // Clear cache to ensure fresh fetch
    clearGeocodeCache()
    await geocodeAddress('123 Test St, Louisville, KY')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'LootAura/1.0 (test@example.com)'
        })
      })
    )
  })

  it('should include email parameter in Nominatim URL', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    mockFetch.mockResolvedValueOnce({
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
    clearGeocodeCache()
    await geocodeAddress('123 Test St, Louisville, KY')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('email=test%40example.com'),
      expect.any(Object)
    )
  })

  it('should use default email when NOMINATIM_APP_EMAIL is not set', async () => {
    delete process.env.NOMINATIM_APP_EMAIL
    
    mockFetch.mockResolvedValueOnce({
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
    clearGeocodeCache()
    await geocodeAddress('123 Test St, Louisville, KY')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('email=admin%40lootaura.com'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'LootAura/1.0 (admin@lootaura.com)'
        })
      })
    )
  })
})

