import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import * as React from 'react'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// MSW server for API mocking
const server = setupServer(
  // Mock /api/sales/markers endpoint
  http.get('/api/sales/markers', ({ request }) => {
    const url = new URL(request.url)
    const categories = url.searchParams.get('categories')
    
    // Return minimal valid markers response
    const markers = categories ? [] : [
      {
        id: 'test-marker-1',
        lat: 38.1405,
        lng: -85.6936,
        title: 'Test Sale',
        price: 100
      }
    ]
    
    return HttpResponse.json(markers)
  }),
  
  // Mock /api/sales endpoint
  http.get('/api/sales', ({ request }) => {
    const url = new URL(request.url)
    const categories = url.searchParams.get('categories')
    
    const sales = categories ? [] : [
      {
        id: 'test-sale-1',
        title: 'Test Sale',
        description: 'Test Description',
        price: 100,
        lat: 38.1405,
        lng: -85.6936,
        date_start: '2025-01-01',
        time_start: '09:00',
        date_end: '2025-01-01',
        time_end: '17:00'
      }
    ]
    
    return HttpResponse.json(sales)
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Export server for use in tests
export { server }

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-maps-key'
process.env.NEXT_PUBLIC_DEBUG = 'false'
// Do not set service role in tests

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
      })),
    },
  }),
}))

// Mock Google Maps
vi.mock('@googlemaps/js-api-loader', () => ({
  Loader: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue({}),
  })),
}))

// Mock @react-google-maps/api loader to be ready in tests
vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
}))

// Provide minimal google maps globals/spies for components relying on them
const Map = vi.fn(function Map(this: any, el: any, opts: any) { this.controls = []; this.fitBounds = vi.fn() })
const Marker = vi.fn(function Marker(this: any, opts: any) { this.addListener = vi.fn() })
const InfoWindow = vi.fn(function InfoWindow(this: any, opts: any) { this.open = vi.fn() })
const LatLngBounds = vi.fn(function LatLngBounds(this: any) { this.extend = vi.fn() })
// @ts-expect-error test globals
globalThis.google = {
  maps: {
    Map,
    Marker,
    InfoWindow,
    LatLngBounds,
    event: { addListener: vi.fn() },
    ControlPosition: { TOP_LEFT: Symbol.for('TOP_LEFT') },
  },
}

// Mock geolocation
Object.defineProperty(navigator, 'geolocation', {
  value: {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  },
  writable: true,
})

// Global DOM shims for JSDOM
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

global.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

// Mock DOMRect with fromRect
const DOMRectMock = function (this: any, x = 0, y = 0, width = 0, height = 0) {
  this.x = x
  this.y = y
  this.width = width
  this.height = height
  this.top = y
  this.left = x
  this.right = x + width
  this.bottom = y + height
  this.toJSON = () => ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height })
} as unknown as typeof DOMRect
;(DOMRectMock as any).fromRect = (other?: DOMRectInit) => new (DOMRectMock as any)(
  other?.x ?? 0,
  other?.y ?? 0,
  other?.width ?? 0,
  other?.height ?? 0,
)
// Allow overriding global for tests
// @ts-ignore
global.DOMRect = DOMRectMock

// Mock TextEncoder/TextDecoder
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock fetch globally to prevent network calls
global.fetch = vi.fn().mockImplementation(() => {
  throw new Error('fetch() called in test - use MSW or mock explicitly')
})

// Mock next/image without JSX to keep this file .ts
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => {
    return React.createElement('img', { src, alt, ...props })
  },
}))
