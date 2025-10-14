import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import * as React from 'react'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Idempotence guard to prevent multiple setup
if (!globalThis.__testSetupInitialized) {
  globalThis.__testSetupInitialized = true

  // Extend Vitest's expect with jest-dom matchers
  expect.extend(matchers)

  // Cleanup after each test
  afterEach(() => {
    cleanup()
  })
}

// MSW server for API mocking (only create once)
let server: ReturnType<typeof setupServer>
if (!globalThis.__mswServer) {
  server = setupServer(
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
      },
      {
        id: 'test-sale-2',
        title: 'Vintage Chair',
        description: 'Antique furniture',
        price: 50,
        lat: 38.1405,
        lng: -85.6936,
        date_start: '2025-01-01',
        time_start: '09:00',
        date_end: '2025-01-01',
        time_end: '17:00'
      }
    ]
    
    return HttpResponse.json({ ok: true, data: sales, count: sales.length })
  })
  )
  
  globalThis.__mswServer = server
  
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
} else {
  server = globalThis.__mswServer
}

// Export server for use in tests
export { server }

// Global registrations (only once)
if (!globalThis.__globalsRegistered) {
  globalThis.__globalsRegistered = true
  
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

// Mock Supabase with table-aware chains and RLS support
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => {
    const client: any = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn((table: string) => {
        const state: any = { table, selects: '*', where: [], operation: 'select' }
        const chain: any = {
          select: vi.fn((cols?: string) => { state.selects = cols || '*'; state.operation = 'select'; return chain }),
          order: vi.fn(() => chain),
          insert: vi.fn((data: any) => { state.operation = 'insert'; state.data = data; return { data: [{ id: 'test-id', ...data[0] }], error: null } }),
          update: vi.fn((data: any) => { state.operation = 'update'; state.data = data; return chain }),
          delete: vi.fn(() => { state.operation = 'delete'; return chain }),
          eq: vi.fn((col: string, val: any) => { state.where.push({ col, val }); return chain }),
          in: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          range: vi.fn(() => chain),
          single: vi.fn(async () => {
            if (state.table === 'sales_v2') {
              return { data: { address_key: 'rk-addr', owner_id: 'owner-1' }, error: null }
            }
            if (state.table === 'reviews_v2') {
              const hasUser = state.where.find((w: any) => w.col === 'user_id')
              return { data: hasUser ? { id: 'rev-1', rating: 4, comment: 'Nice', user_id: hasUser.val } : null, error: null }
            }
            // RLS simulation: check if operation should fail
            if (state.operation === 'update' || state.operation === 'delete') {
              const ownerCheck = state.where.find((w: any) => w.col === 'owner_id')
              const currentUser = state.where.find((w: any) => w.col === 'id')
              if (ownerCheck && currentUser && ownerCheck.val !== currentUser.val) {
                return { data: null, error: { message: 'new row violates row-level security policy' } }
              }
              return { data: [{ id: 'test-id' }], error: null }
            }
            return { data: null, error: null }
          }),
        }
        return chain
      }),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(),
          getPublicUrl: vi.fn(),
        })),
      },
    }
    return client
  },
}))

// Mock useSales hook globally for tests that rely on it implicitly
vi.mock('@/lib/hooks/useSales', () => {
  const defaultMutation = {
    mutateAsync: vi.fn().mockResolvedValue({ id: 'test-id', title: 'Test Sale' }),
    isPending: false,
    error: null,
    data: null,
    variables: null,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
    mutate: vi.fn(),
  }
  return {
    useCreateSale: vi.fn(() => defaultMutation),
    useSales: vi.fn(() => ({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn()
    }))
  }
})

// Mock geocoding module globally
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({
    lat: 38.1405,
    lng: -85.6936,
    formatted_address: '123 Test St, Louisville, KY',
    city: 'Louisville',
    state: 'KY',
    zip: '40201'
  })
}))

// Mock alert to prevent jsdom crashes
globalThis.alert = vi.fn()

// Mock MSW handlers for geocoding endpoints
const geocodeHandlers = [
  http.get('https://nominatim.openstreetmap.org/search', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')
    if (q && q.includes('Test')) {
      return HttpResponse.json([{
        lat: '38.1405',
        lon: '-85.6936',
        display_name: '123 Test St, Louisville, KY'
      }])
    }
    return HttpResponse.json([])
  }),
  http.get('https://maps.googleapis.com/maps/api/geocode/json', ({ request }) => {
    const url = new URL(request.url)
    const address = url.searchParams.get('address')
    if (address && address.includes('Test')) {
      return HttpResponse.json({
        results: [{
          geometry: {
            location: {
              lat: 38.1405,
              lng: -85.6936
            }
          },
          formatted_address: '123 Test St, Louisville, KY',
          address_components: [
            { long_name: 'Louisville', types: ['locality'] },
            { short_name: 'KY', types: ['administrative_area_level_1'] },
            { long_name: '40201', types: ['postal_code'] }
          ]
        }]
      })
    }
    return HttpResponse.json({ results: [] })
  })
]

// Add geocoding handlers to server
server.use(...geocodeHandlers)

// Google Maps not used anymore; remove related mocks/globals

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
const resizeCallbacks: Array<(entries: Array<{ target: Element; contentRect: DOMRectReadOnly }>) => void> = []
global.ResizeObserver = vi.fn().mockImplementation((cb: any) => {
  resizeCallbacks.push(cb)
  return {
    observe: vi.fn((el: Element) => {
      // Trigger an initial resize with a reasonable width to produce 2 columns
      const rect = (DOMRect as any).fromRect({ x: 0, y: 0, width: 900, height: 600 })
      cb([{ target: el, contentRect: rect }])
    }),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }
})

// Helper to trigger ResizeObserver with specific width for tests
export const __simulateResize = (target: Element, width: number) => {
  Object.defineProperty(target, 'offsetWidth', { configurable: true, value: width });
  const entry = [{
    target,
    contentRect: {
      x: 0, y: 0, width, height: 0, top: 0, left: 0, right: width, bottom: 0,
      toJSON: () => ({ x: 0, y: 0, width, height: 0, top: 0, left: 0, right: width, bottom: 0 })
    },
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: []
  }];
  resizeCallbacks.forEach(callback => callback(entry, null as any));
};

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

// Mock fetch globally to prevent network calls but allow known test endpoints
global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : (input as URL).toString()
  if (url.includes('nominatim.openstreetmap.org')) {
    // Delegate to MSW for Nominatim
    return server.handleRequest(new Request(input, init));
  }
  if (url.includes('maps.googleapis.com')) {
    // Delegate to MSW for Google Maps
    return server.handleRequest(new Request(input, init));
  }
  // Let MSW handlers for /api/sales and /api/sales/markers use the HttpResponse
  if (url.startsWith('/api/')) {
    // Defer to MSW by returning a basic ok response; tests that assert data will use MSW server
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  }
  throw new Error(`fetch() called in test without mock: ${url}`)
})

  // Mock next/image without JSX to keep this file .ts
  vi.mock('next/image', () => ({
    default: ({ src, alt, ...props }: any) => {
      return React.createElement('img', { src, alt, ...props })
    },
  }))
}
