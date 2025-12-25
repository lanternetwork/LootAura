import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Expose a flag to optionally disable local fetch stubs in other setups
process.env.TEST_USE_MSW = 'true'

// Handlers
const handlers = [
  // Upstream Nominatim search
  http.get('https://nominatim.openstreetmap.org/search', ({ request }) => {
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
  }),
  // Upstream Nominatim reverse
  http.get('https://nominatim.openstreetmap.org/reverse', ({ request }) => {
    const url = new URL(request.url)
    const lat = url.searchParams.get('lat') || '38.1405'
    const lon = url.searchParams.get('lon') || '-85.6936'
    return HttpResponse.json({
      place_id: 1,
      lat,
      lon,
      display_name: '123 Test St, Louisville, KY',
      address: { city: 'Louisville', state: 'KY', postcode: '40201' },
    })
  }),
  // Relative Next.js routes
  http.get('/api/geolocation/ip', () => {
    return HttpResponse.json({ lat: null, lng: null, city: null, state: null }, { status: 200 })
  }),
  http.get('/api/geocoding/address', ({ request }) => {
    const url = new URL(request.url)
    const address = url.searchParams.get('address') || ''
    if (!address || address.trim().length < 5) {
      return HttpResponse.json({ ok: false, error: 'Address must be at least 5 characters' }, { status: 400 })
    }
    if (/invalid|fail/i.test(address)) {
      return HttpResponse.json({ ok: false, error: 'Address not found' }, { status: 404 })
    }
    return HttpResponse.json({
      ok: true,
      data: {
        lat: 38.1405,
        lng: -85.6936,
        formatted_address: '123 Test St, Louisville, KY',
        city: 'Louisville',
        state: 'KY',
        zip: '40201'
      }
    })
  }),
  http.get('/api/geocoding/suggest', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') || ''
    if (q.length < 2) {
      return HttpResponse.json({ ok: false, code: 'SHORT_QUERY', error: 'Query must be at least 2 characters' }, { status: 400 })
    }
    return HttpResponse.json({
      ok: true,
      data: [
        {
          id: '1',
          label: `${q} Test St, Louisville, KY 40201`,
          lat: 38.2512,
          lng: -85.7494,
          address: { houseNumber: '123', road: 'Test St', city: 'Louisville', state: 'KY', postcode: '40201', country: 'US' },
        },
      ],
    })
  }),
  // Overpass API
  http.post('https://overpass-api.de/api/interpreter', async ({ request }) => {
    const body = await request.text()
    
    // Check for rate limit simulation
    if (body.includes('simulate_429')) {
      return HttpResponse.json({ error: 'rate limit' }, { status: 429 })
    }
    // Check for timeout simulation
    if (body.includes('simulate_timeout')) {
      return new Promise(() => {}) // Never resolves
    }
    
    // Extract prefix from query (look for ["addr:housenumber"~"^X"])
    const prefixMatch = body.match(/"addr:housenumber"~"\^(\d+)"/)
    const prefix = prefixMatch ? prefixMatch[1] : '123'
    
    // Return mock Overpass response with addresses matching prefix
    return HttpResponse.json({
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 38.2512,
          lon: -85.7494,
          tags: {
            'addr:housenumber': `${prefix}`,
            'addr:street': 'Main St',
            'addr:city': 'Louisville',
            'addr:state': 'KY',
            'addr:postcode': '40201',
            'addr:country': 'US'
          }
        },
        {
          type: 'way',
          id: 456,
          center: {
            lat: 38.2520,
            lon: -85.7500
          },
          tags: {
            'addr:housenumber': `${prefix}0`,
            'addr:street': 'Main St',
            'addr:city': 'Louisville',
            'addr:state': 'KY',
            'addr:postcode': '40201'
          }
        }
      ]
    })
  }),
  // Google Places Autocomplete
  http.post('https://places.googleapis.com/v1/places:autocomplete', async ({ request }) => {
    const body = await request.json().catch(() => ({} as any))
    const input = body?.input || ''
    if (!input || input.length < 2) return HttpResponse.json({ predictions: [] })
    return HttpResponse.json({
      predictions: [
        {
          placeId: 'gp1',
          structuredFormat: { mainText: { text: `${input} Main` }, secondaryText: { text: 'Louisville, KY' } },
        },
        {
          placeId: 'gp2',
          structuredFormat: { mainText: { text: `${input} Second` }, secondaryText: { text: 'Louisville, KY' } },
        },
      ],
    })
  }),
  // Google Place Details
  http.get('https://places.googleapis.com/v1/places/:id', ({ params }) => {
    const id = params.id as string
    return HttpResponse.json({
      id,
      formattedAddress: '123 Test St, Louisville, KY 40201',
      addressComponents: [
        { shortText: '123', longText: '123', types: ['street_number'] },
        { shortText: 'Test St', longText: 'Test St', types: ['route'] },
        { shortText: 'Louisville', longText: 'Louisville', types: ['locality'] },
        { shortText: 'KY', longText: 'Kentucky', types: ['administrative_area_level_1'] },
        { shortText: '40201', longText: '40201', types: ['postal_code'] },
        { shortText: 'US', longText: 'United States', types: ['country'] },
      ],
      location: { latitude: 38.2512, longitude: -85.7494 },
    })
  }),
  // Overpass address route
  http.get('/api/geocoding/overpass-address', ({ request }) => {
    const url = new URL(request.url)
    const prefix = url.searchParams.get('prefix') || ''
    const lat = url.searchParams.get('lat')
    const lng = url.searchParams.get('lng')
    
    if (!prefix || !/^\d{1,6}$/.test(prefix)) {
      return HttpResponse.json({ ok: false, code: 'INVALID_PREFIX', error: 'Prefix must be 1-6 digits' }, { status: 400 })
    }
    
    if (!lat || !lng) {
      return HttpResponse.json({ ok: false, code: 'NO_COORDS', error: 'Latitude and longitude are required' }, { status: 400 })
    }
    
    return HttpResponse.json({
      ok: true,
      data: [
        {
          id: `node:${prefix}1`,
          label: `${prefix} Main St, Louisville, KY, 40201`,
          lat: 38.2512,
          lng: -85.7494,
          address: {
            houseNumber: prefix,
            road: 'Main St',
            city: 'Louisville',
            state: 'KY',
            postcode: '40201',
            country: 'US'
          }
        }
      ]
    })
  }),
  http.get('/api/geocoding/reverse', () => {
    return HttpResponse.json({ ok: true, data: { id: 'reverse', label: 'Reverse Result', lat: 38.2512, lng: -85.7494 } })
  }),
  // Analytics tracking endpoint (for unit tests that test analytics client)
  http.post('/api/analytics/track', async () => {
    return HttpResponse.json({ ok: true, data: { event_id: 'test-event-id' } }, { status: 200 })
  }),
  // PostgREST profiles_v2 (silence unhandled warnings in tests that probe unknown usernames)
  http.get(/\/rest\/v1\/profiles_v2.*/i, () => {
    return HttpResponse.json([], { status: 200 })
  }),
]

// Server
export const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(async () => {
  const isCI = process.env.CI === 'true'
  
  // Reset handlers first
  server.resetHandlers()
  
  // In CI: synchronous cleanup only - no timers, no Promise.race
  // Locally: allow async cleanup for better error handling
  if (isCI) {
    // CI: Synchronous cleanup to prevent handle leaks
    // Order: MSW server -> undici dispatcher -> http agents
    
    // 1. MSW server close (sync - don't await)
    try {
      if (typeof server.close === 'function') {
        server.close()
      }
    } catch (error) {
      // Ignore errors in CI
    }
    
    // 2. Close undici dispatcher synchronously (use destroy, not close)
    try {
      const undiciModule = require('undici')
      if (undiciModule && typeof undiciModule.getGlobalDispatcher === 'function') {
        const dispatcher = undiciModule.getGlobalDispatcher()
        if (dispatcher) {
          // In CI, use destroy() directly - it's synchronous and doesn't create timers
          // Do NOT use close() in CI as it returns a Promise and creates handles
          if (typeof dispatcher.destroy === 'function') {
            dispatcher.destroy()
          }
          // If destroy doesn't exist, we skip cleanup in CI to avoid creating Promise handles
        }
      }
    } catch (error: any) {
      // Ignore errors in CI
      if (error?.code !== 'MODULE_NOT_FOUND') {
        // Silent fail in CI
      }
    }
    
    // 3. Close HTTP agents synchronously
    const http = require('http')
    const https = require('https')
    
    if (http.globalAgent && typeof http.globalAgent.destroy === 'function') {
      http.globalAgent.destroy()
    }
    
    // 4. Close HTTPS agents synchronously
    if (https.globalAgent && typeof https.globalAgent.destroy === 'function') {
      https.globalAgent.destroy()
    }
  } else {
    // Local: Allow async cleanup with proper error handling
    try {
      await server.close()
      // Give MSW a moment to fully clean up internal handles (only locally)
      await new Promise(resolve => setImmediate(resolve))
    } catch (error) {
      // Only log if diagnostics are enabled to avoid memory issues
      if (process.env.ENABLE_HANDLE_DIAGNOSTICS === 'true') {
        console.log('[HANDLE_DIAG] MSW server.close() error (ignored):', error)
      }
    }

    // Close all HTTP agent connections to prevent Socket handle leaks
    const http = require('http')
    const https = require('https')
    
    if (http.globalAgent && typeof http.globalAgent.destroy === 'function') {
      http.globalAgent.destroy()
    }
    
    if (https.globalAgent && typeof https.globalAgent.destroy === 'function') {
      https.globalAgent.destroy()
    }

    // Close undici dispatcher (local: can use async with timeout)
    try {
      const undiciModule = require('undici')
      if (undiciModule && typeof undiciModule.getGlobalDispatcher === 'function') {
        const dispatcher = undiciModule.getGlobalDispatcher()
        if (dispatcher) {
          if (typeof dispatcher.close === 'function') {
            await Promise.race([
              dispatcher.close(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('undici close timeout')), 5000)
              )
            ]).catch(() => {
              if (typeof dispatcher.destroy === 'function') {
                dispatcher.destroy()
              }
            })
          } else if (typeof dispatcher.destroy === 'function') {
            dispatcher.destroy()
          }
        }
      }
    } catch (error: any) {
      if (process.env.ENABLE_HANDLE_DIAGNOSTICS === 'true' && error?.code !== 'MODULE_NOT_FOUND') {
        console.log('[HANDLE_DIAG] undici dispatcher cleanup error (ignored):', error?.message || error)
      }
    }
  }
})
