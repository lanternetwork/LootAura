import '@testing-library/jest-dom/vitest'
import React from 'react'

import { vi } from 'vitest'

// Ensure rate limiting is bypassed in tests
;(process.env as any).RATE_LIMITING_ENABLED = 'false'

// Mock next/image to avoid optimization/config errors in JSDOM
// @ts-ignore vitest mock hoisting in test env
vi.mock('next/image', () => {
  return {
    __esModule: true,
    default: (props: any) => {
      const { src, alt = '', fill: _fill, loader: _loader, placeholder: _ph, blurDataURL: _blur, unoptimized: _u, priority: _priority, quality: _q, ...rest } = props || {}
      const resolved = typeof src === 'string' ? src : (src?.src || '')
      // Drop Next.js-specific boolean/unsupported attributes (e.g., fill) to avoid DOM warnings
      return React.createElement('img', { src: resolved, alt, ...rest })
    },
  }
})

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
// Ensure required env vars are set before any modules import ENV_PUBLIC or ENV_SERVER
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key-min-10-chars'
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'test-service-role-min-10-chars'
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

// Supabase server mock used by tests - DISABLED to allow test-specific mocks
// @ts-ignore vitest mock hoisting in test env
/*
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn((tableName: string) => {
      const chain: any = {}
      
      // Create a proper chain object that returns itself for method chaining
      const createChain = () => {
        const mockChain = {
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({
            data: [],
            error: null
          }),
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null
          }),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-id', owner_id: 'test-user' },
            error: null
          })
        }
        return mockChain
      }
      
      chain.select = vi.fn((columns: string | string[], options?: any) => {
        if (options?.count === 'exact' && options?.head === true) {
          // Count query
          return {
            eq: vi.fn().mockResolvedValue({
              count: 0,
              error: null
            })
          }
        } else {
          // Regular select query - return a properly mocked chain
          return createChain()
        }
      })
      
      chain.insert = vi.fn((rows: any[]) => ({ data: rows, error: null }))
      chain.update = vi.fn(() => createChain())
      chain.delete = vi.fn(() => createChain())
      chain.eq = vi.fn(() => createChain())
      chain.gte = vi.fn(() => createChain())
      chain.lte = vi.fn(() => createChain())
      chain.in = vi.fn(() => createChain())
      chain.or = vi.fn(() => createChain())
      chain.order = vi.fn(() => createChain())
      chain.range = vi.fn(() => Promise.resolve({ data: [], error: null }))
      chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
      chain.single = vi.fn(async () => ({ data: { id: 'test-id', owner_id: 'test-user' }, error: null }))
      
      return chain
    }),
  })),
}))
*/

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

// Console noise guardrail - fail tests on unexpected console output
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

// Allowlist for known intentional console messages
// Each entry includes: pattern, owning test file, and reason for allowance
const ALLOWED_PATTERNS = [
  // Debug logging (tests/setup.ts, lib/map/viewportFetchManager.ts)
  /^\[MAP:DEBOUNCE\]/, // Debug logging from debounce manager - tests/integration/map.debounce-cancel.test.ts
  /^\[usage\]/, // Usage logging - tests/unit/usage-logs.test.ts
  /^\[CATEGORY CONTRACT\]/, // Category contract logging - tests/unit/category-parse-url.test.ts
  /^\[CACHE\]/, // Cache logging - tests/unit/cache.db.test.ts, tests/integration/map.prefetch-offline.test.tsx
  
  // Expected API error logging (app/api/share/route.ts)
  /^Share API error:/, // Expected API error logging - tests/unit/share.api.test.ts
  /^Failed to store shared state:/, // Expected error logging - tests/unit/share.api.test.ts
  /^Failed to retrieve shared state:/, // Expected error logging - tests/unit/share.api.test.ts
  
  // Expected cache error logging (lib/cache/db.ts)
  /^Failed to get cached markers:/, // Expected cache error logging - tests/unit/cache.db.test.ts
  /^Failed to store markers:/, // Expected cache error logging - tests/unit/cache.db.test.ts
  /^Failed to prune cache:/, // Expected cache error logging - tests/unit/cache.db.test.ts
  /^Failed to clear cache:/, // Expected cache error logging - tests/unit/cache.db.test.ts
  /^Failed to get cache stats:/, // Expected cache error logging - tests/unit/cache.db.test.ts
  
  // Expected shortlink test errors (app/s/[id]/page.tsx)
  /^Shortlink resolution error:/, // Expected shortlink test errors - tests/integration/share.redirect.test.tsx
  
  // React forwardRef warnings (components/location/SalesMapClustered.tsx)
  /^Warning: Function components cannot be given refs/, // React forwardRef warnings - tests/integration/map.clusters-flow.test.tsx
  /^Warning: .*: `ref` is not a prop/, // React ref prop warnings - tests/integration/map.clusters-flow.test.tsx
  /^Warning: %s: `ref` is not a prop/, // React ref prop warnings with placeholder - tests/integration/map.clusters-flow.test.tsx
  
  // React error boundary messages (React error boundaries)
  /^The above error occurred in the/, // React error boundary messages - tests/components/AddSaleForm.a11y.test.tsx
  /^Consider adding an error boundary/, // React error boundary suggestions - tests/components/AddSaleForm.a11y.test.tsx
  /^This error originated in/, // React error origin messages - tests/components/AddSaleForm.a11y.test.tsx
  /^The latest test that might've caused/, // React test error context - tests/components/AddSaleForm.a11y.test.tsx
  
  // React act() warnings (async state updates in tests)
  /^Warning: The current testing environment is not configured to support act/, // React act() warnings - tests/integration/landing.featured-demo.test.tsx
  /^Warning:.*act\(/i, // React act() warnings with act() mention - tests/integration/landing.featured-demo.test.tsx
  
  // React unmount warnings (component cleanup in tests)
  /^Warning: Attempted to synchronously unmount a root while React was already rendering/, // React unmount race condition - tests/integration/landing.featured-demo.test.tsx
  
  // Nested console guardrail errors (tests/setup.ts)
  /^Error: Unexpected console.error:/, // Nested console guardrail errors - tests/setup.ts
]

const isAllowedMessage = (message: string): boolean => {
  return ALLOWED_PATTERNS.some(pattern => pattern.test(message))
}

console.error = (...args: any[]) => {
  const message = args.join(' ')
  if (!isAllowedMessage(message)) {
    throw new Error(`Unexpected console.error: ${message}`)
  }
  originalConsoleError(...args)
}

console.warn = (...args: any[]) => {
  const message = args.join(' ')
  if (!isAllowedMessage(message)) {
    throw new Error(`Unexpected console.warn: ${message}`)
  }
  originalConsoleWarn(...args)
}

