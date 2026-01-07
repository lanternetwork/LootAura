import '@testing-library/jest-dom/vitest'
import React from 'react'

import { vi, afterEach as vitestAfterEach } from 'vitest'
import makeStableSupabaseClient from './utils/mocks/supabaseServerStable'

// never re-create this per test, keep it stable
const stableSupabase = makeStableSupabaseClient()

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
process.env.NOMINATIM_APP_EMAIL = process.env.NOMINATIM_APP_EMAIL || 'test@example.com'

// Supabase client mock - module-level constant object literal
// This ensures auth.getUser() ALWAYS resolves immediately, preventing navigation hangs
// The same instance is returned on every createSupabaseBrowserClient() call
// Immune to vi.clearAllMocks() because it uses no spies or mock functions
// @ts-ignore vitest mock hoisting in test env
vi.mock('@/lib/supabase/client', () => {
  // Module-level constant - created once, never changes, no closures, no dynamic state
  // Pre-create the resolved promise to ensure immediate resolution
  const RESOLVED_USER_PROMISE = Promise.resolve({ data: { user: { id: 'test-user' } }, error: null })
  const MOCK_CLIENT = {
    auth: {
      getUser: () => RESOLVED_USER_PROMISE,
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      }),
      signInWithPassword: async () => ({ data: { user: { id: 'test-user' } }, error: null }),
      signUp: async () => ({ data: { user: { id: 'test-user' } }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => {
      const chain: any = {}
      chain.select = () => chain
      chain.insert = (rows: any[]) => ({ data: rows, error: null })
      chain.update = () => chain
      chain.delete = () => chain
      chain.eq = () => chain
      chain.single = async () => ({ data: { id: 'test-id', owner_id: 'test-user' }, error: null })
      return chain
    },
  }
  
  return {
    createSupabaseBrowserClient: () => MOCK_CLIENT,
  }
})

// Supabase server mock used by tests - stable and non-clearable
// @ts-ignore vitest mock hoisting in test env
vi.mock('@/lib/supabase/server', () => {
  return {
    createSupabaseServerClient: vi.fn(() => stableSupabase),
  }
})

// Prefer real geocode module in combination with MSW; keep minimal mocks local to specific tests

// Do not globally stub fetch; MSW server (tests/setup/msw.server.ts) will intercept network calls

// Mock window.matchMedia for JSDOM test environment (guard Node environment)
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

if (typeof window !== 'undefined' && (window as any)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia,
  })
}

if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis as any, 'matchMedia', {
    writable: true,
    value: mockMatchMedia,
  })
}

try {
  (global as any).matchMedia = mockMatchMedia
} catch {}

// Console noise guardrail - fail tests on unexpected console output
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

// Allowlist for known intentional console messages
// Each entry includes: pattern, owning test file, and reason for allowance
const ALLOWED_PATTERNS = [
  // Debug logging (tests/setup.ts, lib/map/viewportFetchManager.ts)
  /^\[MAP:DEBOUNCE\]/, // Debug logging from debounce manager - tests/integration/map.debounce-cancel.test.ts
  /^\[MAP:PERSISTENCE\]/, // Viewport persistence error logging - tests/integration/viewport.persistence.test.tsx
  /^\[GEO\]/, // Geolocation error logging - tests/integration/viewport.persistence.test.tsx
  /^\[VIEWPORT_RESOLVER\]/, // Viewport resolver debug logging - tests/integration/viewport.persistence.test.tsx
  /^\[USE_MY_LOCATION\]/, // Use my location button debug logging - tests/integration/viewport.persistence.test.tsx
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
  
  // React Email DOM validation warnings (lib/email/templates/*.tsx)
  /Warning: validateDOMNesting/, // React Email components may trigger DOM nesting warnings in test environment - tests/unit/email/*.test.tsx
  
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
  
  // FeaturedSalesSection logging (components/landing/FeaturedSalesSection.tsx)
  /^\[FeaturedSales\]/, // FeaturedSales debug logging - tests/integration/landing.featured-demo.test.tsx
  /^Failed to fetch featured sales:/, // FeaturedSales error logging - tests/integration/landing.featured-demo.test.tsx
  
  // Profile API error logging (app/api/profile/route.ts)
  /^\[PROFILE\] GET update_profile RPC failed:/, // Expected RPC error in profile not found test - tests/unit/auth/profile.test.ts
  /^\[PROFILE\] GET update_profile RPC exception:/, // Expected RPC exception in profile not found test - tests/unit/auth/profile.test.ts
  
  // Sales API error logging (app/api/sales/route.ts)
  /^\[SALES\] Unexpected error:/, // Expected error logging in sales POST handler - tests/integration/sales.imageFields.persist.test.ts
  
  // CSRF validation warnings (lib/api/csrfCheck.ts)
  /\[WARN\] \[csrfCheck\] \[csrf_validation\] CSRF token validation failed/, // Expected CSRF validation warnings in tests without CSRF tokens - tests/integration/sales.imageFields.persist.test.ts
  /\[CSRF_CHECK\] ✗ CSRF token validation failed/, // Expected CSRF validation errors in tests without CSRF tokens - tests/integration/csrf.protection.test.ts, tests/integration/seller.rating.api.test.ts
  /\[CSRF_CHECK\] Exception during CSRF check:/, // Expected CSRF exception logging in tests - tests/integration/csrf.protection.test.ts, tests/integration/seller.rating.api.test.ts
  
  // Map component error logging (components/location/SimpleMap.tsx)
  /^\[SIMPLE_MAP\] Map error:/, // Expected map error logging in tests - tests/unit/a11y.smoke.test.tsx
  /^\[SIMPLE_MAP\] Token format may be invalid/, // Expected token format warning when debug mode is enabled - tests/integration/simplemap.clusters.integration.test.tsx
  
  // React act() warnings (React 18 concurrent rendering in tests)
  /^Error: Should not already be working/, // React act() warnings during component cleanup - tests/unit/a11y.smoke.test.tsx
  
  // Draft publish error logging (app/api/drafts/publish/route.ts)
  /^\[PUBLISH\/POST\] thrown:/, // Expected error logging in draft publish rollback tests - tests/integration/drafts.publish.rollback.test.ts
  
  // Analytics client logging (lib/analytics-client.ts)
  /^\[ANALYTICS_CLIENT\] Tracking (error|failed):/, // Expected analytics tracking error logging in tests - tests/unit/analytics-client.test.ts
  
  // Favorite sales starting soon job logging (lib/jobs/processor.ts)
  /\[WARN\] \[jobs\/favorite-sales-starting-soon\]/, // Expected warning when email send fails in job tests - tests/integration/jobs/favorite-sales-starting-soon.test.ts
  /\[ERROR\] \[jobs\/favorite-sales-starting-soon\]/, // Expected error logging in job tests - tests/integration/jobs/favorite-sales-starting-soon.test.ts
  
  // Seller weekly analytics job logging (lib/jobs/processor.ts)
  /\[WARN\] \[jobs\/seller-weekly-analytics\]/, // Expected warning when email send fails in job tests - tests/integration/jobs/seller-weekly-analytics.test.ts
  /\[ERROR\] \[jobs\/seller-weekly-analytics\]/, // Expected error logging in job tests - tests/integration/jobs/seller-weekly-analytics.test.ts
  
  // Unsubscribe endpoint error logging (app/email/unsubscribe/route.ts)
  /^\[UNSUBSCRIBE\]/, // Expected error logging in unsubscribe endpoint tests - tests/integration/email/unsubscribe.test.ts
  
  // Debug logging when NEXT_PUBLIC_DEBUG is enabled (app/sales/[id]/SaleDetailClient.tsx, lib/data/salesAccess.ts)
  /^\[SALE_DETAIL_CLIENT\]/, // Debug logging from SaleDetailClient when debug mode is enabled - tests/unit/a11y.smoke.test.tsx
  /^\[ITEMS_DEBUG\]/, // Debug logging from salesAccess when debug mode is enabled - tests/integration/moderation.hidden-sales-visibility.test.ts
  /^\[ITEMS_QUERY\]/, // Debug logging from salesAccess items query (always-on for diagnosis) - tests/unit/a11y.smoke.test.tsx, tests/integration/*
  /^\[ItemImage\]/, // Debug logging from ItemImage component when debug mode is enabled - tests/unit/a11y.smoke.test.tsx
  
  // CSRF client logging (lib/api/csrfClient.ts)
  /^\[CSRF_CLIENT\]/, // CSRF client logging - tests/integration/sale.share-button.render.test.tsx, tests/integration/sale.details.*.test.tsx
  /^\[ITEMS_DIAG\]/, // Items diagnostic logging - lib/data/salesAccess.ts getSaleWithItems
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
  // Allow GoTrueClient warning about multiple instances (common in tests)
  if (message.includes('Multiple GoTrueClient instances')) {
    return // Suppress this warning
  }
  if (!isAllowedMessage(message)) {
    throw new Error(`Unexpected console.warn: ${message}`)
  }
  originalConsoleWarn(...args)
}

// Clear geocode caches after each test to ensure determinism for TTL-based tests
vitestAfterEach(async () => {
  try {
    const mod = await import('@/lib/geocode')
    if (typeof (mod as any).clearGeocodeCache === 'function') {
      (mod as any).clearGeocodeCache()
    }
  } catch {}
  try {
    const clear = (globalThis as any).__clearSuggestCache
    if (typeof clear === 'function') clear()
  } catch {}
  try {
    const clear = (globalThis as any).__clearOverpassCache
    if (typeof clear === 'function') clear()
  } catch {}
})

// Global unhandled rejection handler to catch ZodErrors from env validation during tests
// These errors are expected in env.test.ts when testing error conditions
process.on('unhandledRejection', (reason: unknown) => {
  // Ignore ZodErrors from env validation during tests
  // These are expected when testing error conditions in env.test.ts
  if (reason && typeof reason === 'object' && 'issues' in reason) {
    // Check if this is from env.test.ts by checking the stack trace
    // Safely access stack property - ZodError may have a stack property
    const stack = (reason instanceof Error ? reason.stack : (reason as any).stack) || ''
    if (stack.includes('env.test.ts') || stack.includes('lib/env.ts')) {
      // This is an expected error from env validation tests - ignore it
      return
    }
  }
  // For other unhandled rejections, let them propagate (Vitest will handle them)
})

