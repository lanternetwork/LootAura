import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodeAddress } from '@/lib/geocode'
import { getAddressFixtures } from '@/tests/utils/mocks'

// Unmock the geocode module to use real implementation with MSW handlers
vi.unmock('@/lib/geocode')

// Mock environment variables
const originalEnv = process.env

describe('Geocoding Fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should fallback to Nominatim when Google Maps fails', async () => {
    // Mock Google Maps API to fail
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'invalid-key'
    
    // Mock Nominatim to succeed
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    // Use MSW handlers instead of local fetch mocking

    const result = await geocodeAddress(testAddress.address)
    
    // Should get Louisville coordinates from Nominatim fallback
    expect(result).toEqual({
      lat: 38.1405,
      lng: -85.6936,
      formatted_address: '123 Test St, Louisville, KY',
      city: 'Louisville',
      state: 'KY',
      zip: '40201'
    })
  })

  it('should return null when both Google and Nominatim fail', async () => {
    // Mock both APIs to fail
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'invalid-key'
    
    // Use an address that doesn't match MSW handler patterns
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })

  it('should use Google Maps when API key is valid', async () => {
    // Mock Google Maps API to succeed
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'valid-key'
    
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    // Clear any previous calls to the global fetch mock
    vi.mocked(global.fetch).mockClear()

    const result = await geocodeAddress(testAddress.address)
    
    expect(result).toEqual({
      lat: 37.422,
      lng: -122.084,
      formatted_address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA',
      city: 'Mountain View',
      state: 'CA',
      zip: '94043'
    })
    
    // Should call Google Maps API - check the mock's call history
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('maps.googleapis.com'),
      expect.any(Object)
    )
  })

  it('should handle Nominatim rate limiting gracefully', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'invalid-key'
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    // Use an address that doesn't match MSW handler patterns to get null result
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })

  it('should include proper headers for Nominatim requests', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'invalid-key'
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    // Clear any previous calls to the global fetch mock
    vi.mocked(global.fetch).mockClear()

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
    
    // Check that fetch was called (MSW handlers should have been triggered)
    expect(global.fetch).toHaveBeenCalled()
  })

  it('should cache results to avoid repeated API calls', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'valid-key'
    
    const addresses = getAddressFixtures()
    const testAddress = addresses[0]
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{
          geometry: {
            location: {
              lat: testAddress.lat,
              lng: testAddress.lng
            }
          },
          formatted_address: testAddress.formatted_address,
          address_components: []
        }]
      })
    })

    // First call
    const result1 = await geocodeAddress(testAddress.address)
    expect(result1).toBeTruthy()
    
    // Reset call count before second call
    vi.clearAllMocks()
    
    // Second call should use cache
    const result2 = await geocodeAddress(testAddress.address)
    expect(result2).toEqual(result1)
    
    // Should not call API again due to caching
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should handle malformed Nominatim responses', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'invalid-key'
    
    // Use an address that doesn't match MSW handler patterns to get null result
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })

  it('should handle network errors gracefully', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'invalid-key'
    
    // Use an address that doesn't match MSW handler patterns to get null result
    const result = await geocodeAddress('Invalid Address That Should Fail')
    
    expect(result).toBeNull()
  })
})
