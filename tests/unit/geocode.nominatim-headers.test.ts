import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We'll stub global fetch before importing the module under test to ensure the module uses our stub
let mockFetch: ReturnType<typeof vi.fn>

// Mock process.env
const originalEnv = process.env

describe('Geocode Address API', () => {
  beforeEach(() => {
    vi.resetModules()
    // Ensure the real module is used for these tests (override global setup mock)
    vi.doUnmock('@/lib/geocode')
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('should call the geocoding API endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          lat: 38.2512,
          lng: -85.7494,
          formatted_address: '123 Test St, Louisville, KY',
          city: 'Louisville',
          state: 'KY',
          zip: '40201'
        }
      })
    })

    // Re-import to get fresh module with env
    const { geocodeAddress } = await import('@/lib/geocode')
    const result = await geocodeAddress('123 Test St, Louisville, KY')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/geocoding/address'),
      undefined
    )
    expect(result).toEqual({
      lat: 38.2512,
      lng: -85.7494,
      formatted_address: '123 Test St, Louisville, KY',
      city: 'Louisville',
      state: 'KY',
      zip: '40201'
    })
  })

  it('should handle API endpoint errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        ok: false,
        error: 'Address not found'
      })
    })

    const { geocodeAddress } = await import('@/lib/geocode')
    const result = await geocodeAddress('Invalid Address')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/geocoding/address'),
      undefined
    )
    expect(result).toBeNull()
  })

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { geocodeAddress } = await import('@/lib/geocode')
    const result = await geocodeAddress('123 Test St, Louisville, KY')

    expect(mockFetch).toHaveBeenCalled()
    expect(result).toBeNull()
  })
})

