import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
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
  http.get('/api/sales/markers', () => {
    return HttpResponse.json({ 
      ok: true, 
      data: [
        { id: 'test-marker-1', lat: 38.1405, lng: -85.6936, title: 'Test Sale' },
        { id: 'test-marker-2', lat: 38.1505, lng: -85.7036, title: 'Another Sale' }
      ], 
      count: 2 
    })
  }),
  
  http.get('/api/sales', () => {
    return HttpResponse.json({ 
      ok: true, 
      data: [
        {
          id: 'test-sale-1',
          title: 'Test Sale',
          description: 'Test Description',
          price: 100,
          lat: 38.1405,
          lng: -85.6936,
          date_start: '2025-01-01',
          time_start: '09:00',
          city: 'Louisville',
          state: 'KY',
          owner_id: 'test-user',
          zip_code: '40202',
          status: 'published',
          privacy_mode: 'exact',
          is_featured: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ], 
      count: 1 
    })
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
process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-1234567890'
process.env.NEXT_PUBLIC_SITE_URL = 'https://lootaura.app'
process.env.NEXT_PUBLIC_DEBUG = 'false'

// Global Browser API Mocks
// Keep a registry of active ResizeObserver instances for deterministic test control
;(globalThis as any).__activeResizeObservers = (globalThis as any).__activeResizeObservers || new Set<any>()

globalThis.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback
  private targets: Set<Element>

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    this.targets = new Set<Element>()
    ;(globalThis as any).__activeResizeObservers.add(this)
  }

  observe(target: Element) {
    this.targets.add(target)
    // Fire an initial measurement so components can compute columns immediately
    const width = (target as any).offsetWidth ?? 0
    const entry = {
      target,
      contentRect: new DOMRectMock(0, 0, width, 100),
      borderBoxSize: [{ inlineSize: width, blockSize: 100 }],
      contentBoxSize: [{ inlineSize: width, blockSize: 100 }],
      devicePixelContentBoxSize: [{ inlineSize: width, blockSize: 100 }]
    } as unknown as ResizeObserverEntry
    queueMicrotask(() => this.callback([entry], this))
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    ;(globalThis as any).__activeResizeObservers.delete(this)
  }
}

globalThis.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  root = null
  rootMargin = ''
  thresholds = []
  takeRecords() { return [] }
}

globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

class DOMRectMock implements DOMRect {
  x: number; y: number; width: number; height: number
  top: number; left: number; right: number; bottom: number
  
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x; this.y = y; this.width = width; this.height = height
    this.top = y; this.left = x; this.right = x + width; this.bottom = y + height
  }
  
  toJSON() {
    return { x: this.x, y: this.y, width: this.width, height: this.height, 
             top: this.top, left: this.left, right: this.right, bottom: this.bottom }
  }
  
  static fromRect(other?: DOMRectInit): DOMRect {
    return new DOMRectMock(other?.x ?? 0, other?.y ?? 0, other?.width ?? 0, other?.height ?? 0)
  }
}

globalThis.DOMRect = DOMRectMock as any

// Global resize simulation helper
globalThis.__simulateResize = (element: Element, width: number) => {
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: width })
  const observers: Set<any> = (globalThis as any).__activeResizeObservers
  if (observers && observers.size > 0) {
    observers.forEach((ro) => {
      if (ro && ro.callback && ro["targets"] && ro["targets"].has(element)) {
        const entry = {
          target: element,
          contentRect: new DOMRectMock(0, 0, width, 100),
          borderBoxSize: [{ inlineSize: width, blockSize: 100 }],
          contentBoxSize: [{ inlineSize: width, blockSize: 100 }],
          devicePixelContentBoxSize: [{ inlineSize: width, blockSize: 100 }]
        } as unknown as ResizeObserverEntry
        ro.callback([entry], ro)
      }
    })
  }
}

// Global fetch mock
globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' 
    ? input 
    : input instanceof URL 
      ? input.toString()
      : input instanceof Request
        ? input.url
        : String(input)
  
  // Nominatim geocoding
  if (url.includes('nominatim.openstreetmap.org')) {
    if (url.includes('Invalid') || url.includes('Fail')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify([{
      lat: '38.1405',
      lon: '-85.6936',
      display_name: '123 Test St, Louisville, KY',
      address: {
        city: 'Louisville',
        state: 'KY',
        postcode: '40201'
      }
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  // API endpoints
  if (url.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  throw new Error(`Unmocked fetch: ${url}`)
})

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: (props: any) => {
    const { src, alt, ...rest } = props
    return Object.assign(document.createElement('img'), { src, alt, ...rest })
  },
}))

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ 
        data: { user: { id: 'test-user-id', email: 'test@example.com' } }, 
        error: null 
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        insert: vi.fn(() => ({ data: [{ id: 'test-id', owner_id: 'test-user-id' }], error: null })),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        range: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn(() => {
          if (table === 'sales_v2') {
            return Promise.resolve({ 
              data: { id: 'test-id', address_key: 'test-key', owner_id: 'test-user' }, 
              error: null 
            })
          }
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
        }),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }
      return chain
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://test.com/photo.jpg' } })),
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

// Mock geolocation
Object.defineProperty(navigator, 'geolocation', {
  value: {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  },
  writable: true,
})

// Mock application hooks
vi.mock('@/lib/hooks/useSales', () => ({
  useCreateSale: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'test-id', title: 'Test Sale' }),
    isPending: false,
    error: null,
    mutate: vi.fn(),
  })),
  useSales: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    data: { id: 'test-user', email: 'test@example.com' },
    isLoading: false,
    error: null,
  })),
  useFavorites: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
  useToggleFavorite: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}))

// Mock geocode
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn().mockImplementation(async (address: string) => {
    if (address.includes('Invalid') || address.includes('Fail')) {
      return null
    }
    return {
      lat: 38.1405,
      lng: -85.6936,
      formatted_address: '123 Test St, Louisville, KY',
      city: 'Louisville',
      state: 'KY',
      zip: '40201'
    }
  }),
  clearGeocodeCache: vi.fn(),
}))
