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
        address: { city: 'Louisville', state: 'KY', postcode: '40201' },
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
