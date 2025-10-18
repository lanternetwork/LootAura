import '@testing-library/jest-dom/vitest'

import { vi } from 'vitest'

// Minimal globals to satisfy failing tests
// Functional ResizeObserver mock with simulation hook used by tests
{
  type ROCallback = (entries: Array<{ target: Element; contentRect: { width: number; height: number } }>) => void
  const targets = new WeakMap<Element, { cb: ROCallback }>()

  class RO {
    private cb: ROCallback
    constructor(cb: ROCallback) {
      this.cb = cb
    }
    observe(target: Element) {
      targets.set(target, { cb: this.cb })
    }
    unobserve(target: Element) {
      targets.delete(target)
    }
    disconnect() {
      // no-op
    }
  }
  (globalThis as any).ResizeObserver = RO as any
  (globalThis as any).__simulateResize = (target: Element, width = 700, height = 600) => {
    const entry = targets.get(target)
    if (entry) {
      entry.cb([{ target, contentRect: { width, height } } as any])
    }
  }
}

// @ts-ignore vitest mock hoisting in test env
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

// Some Next versions resolve the hook from internal paths; mock them too
// @ts-ignore vitest mock hoisting in test env
vi.mock('next/dist/client/components/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))
// @ts-ignore vitest mock hoisting in test env
vi.mock('next/src/client/components/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Env for tests that expect defaults
process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.app'

// Supabase client mock used by tests
// @ts-ignore vitest mock hoisting in test env
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => {
      const chain: any = {}
      chain.select = vi.fn(() => chain)
      chain.insert = vi.fn((rows: any[]) => ({ data: rows, error: null }))
      chain.update = vi.fn(() => chain)
      chain.delete = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.single = vi.fn(async () => ({ data: { id: 'test-id', owner_id: 'test-user' }, error: null }))
      return chain
    }),
  }),
}))

// Supabase server mock used by tests
// @ts-ignore vitest mock hoisting in test env
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => {
      const chain: any = {}
      chain.select = vi.fn(() => chain)
      chain.insert = vi.fn((rows: any[]) => ({ data: rows, error: null }))
      chain.update = vi.fn(() => chain)
      chain.delete = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.single = vi.fn(async () => ({ data: { id: 'test-id', owner_id: 'test-user' }, error: null }))
      return chain
    }),
  })),
}))

// Geocode mock ensuring non-null for valid addresses
// @ts-ignore vitest mock hoisting in test env
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn(async (addr: string) => {
    if (!addr || /invalid|fail/i.test(addr)) return null
    return {
      lat: 38.1405,
      lng: -85.6936,
      formatted_address: '123 Test St, Louisville, KY',
      city: 'Louisville',
      state: 'KY',
      zip: '40201',
    }
  }),
  clearGeocodeCache: vi.fn(),
}))

// Fetch mock for Nominatim fallback used by geocode module (always override)
const g: any = globalThis as any
g.fetch = vi.fn(async (input: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? ''
  if (/nominatim\.openstreetmap\.org/.test(url)) {
    if (/invalid|fail/i.test(url)) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(
      JSON.stringify([
        {
          lat: '38.1405',
          lon: '-85.6936',
          display_name: '123 Test St, Louisville, KY',
          address: { city: 'Louisville', state: 'KY', postcode: '40201' },
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})

// Mock window.matchMedia for JSDOM test environment
const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(), // deprecated
  removeListener: vi.fn(), // deprecated
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
})

// Also mock it on globalThis for broader compatibility
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
})

// Ensure it's available on the global object as well
;(global as any).matchMedia = mockMatchMedia

