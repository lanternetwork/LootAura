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

afterAll(() => {
  server.close()
})
