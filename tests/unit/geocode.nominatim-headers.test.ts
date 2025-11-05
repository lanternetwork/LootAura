import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/setup/msw.server'
import { geocodeAddress, clearGeocodeCache } from '@/lib/geocode'

// Mock process.env
const originalEnv = process.env

describe('Nominatim Headers', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    clearGeocodeCache()
  })

  afterEach(() => {
    process.env = originalEnv
    clearGeocodeCache()
  })

  it('should include User-Agent header in Nominatim requests', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    let capturedUserAgent: string | null = null
    
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async ({ request }) => {
        capturedUserAgent = request.headers.get('user-agent')
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

    // Re-import to get fresh module with env
    const { geocodeAddress: geocode } = await import('@/lib/geocode')
    clearGeocodeCache()
    await geocode('123 Test St, Louisville, KY')

    expect(capturedUserAgent).toBe('LootAura/1.0 (test@example.com)')
  })

  it('should include email parameter in Nominatim URL', async () => {
    process.env.NOMINATIM_APP_EMAIL = 'test@example.com'
    
    let capturedUrl: string | undefined
    
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async ({ request }) => {
        capturedUrl = request.url
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

    const { geocodeAddress: geocode } = await import('@/lib/geocode')
    clearGeocodeCache()
    await geocode('123 Test St, Louisville, KY')

    expect(capturedUrl).toBeDefined()
    expect(capturedUrl).toContain('email=test%40example.com')
  })

  it('should use default email when NOMINATIM_APP_EMAIL is not set', async () => {
    delete process.env.NOMINATIM_APP_EMAIL
    
    let capturedUrl: string | undefined
    let capturedUserAgent: string | null = null
    
    server.use(
      http.get('https://nominatim.openstreetmap.org/search', async ({ request }) => {
        capturedUrl = request.url
        capturedUserAgent = request.headers.get('user-agent')
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

    const { geocodeAddress: geocode } = await import('@/lib/geocode')
    clearGeocodeCache()
    await geocode('123 Test St, Louisville, KY')

    expect(capturedUrl).toBeDefined()
    expect(capturedUrl).toContain('email=admin%40lootaura.com')
    expect(capturedUserAgent).toBe('LootAura/1.0 (admin@lootaura.com)')
  })
})
