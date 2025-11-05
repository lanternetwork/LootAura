import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodeAddress } from '@/lib/geocode'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Mock process.env
const originalEnv = process.env

describe('Nominatim Headers', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockClear()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
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

    // Re-import to get fresh module with env
    const { geocodeAddress } = await import('@/lib/geocode')
    await geocodeAddress('123 Test St, Louisville, KY')

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

    const { geocodeAddress } = await import('@/lib/geocode')
    await geocodeAddress('123 Test St, Louisville, KY')

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

    const { geocodeAddress } = await import('@/lib/geocode')
    await geocodeAddress('123 Test St, Louisville, KY')

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

