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
    if (q.length < 3) {
      return HttpResponse.json({ ok: false, error: 'Query must be at least 3 characters' }, { status: 400 })
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
