import '@testing-library/jest-dom/vitest'
import React from 'react'

import { vi, afterEach as vitestAfterEach, afterAll } from 'vitest'
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

// Supabase client mock used by tests
// @ts-ignore vitest mock hoisting in test env
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn((_callback: any) => {
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        }
      }),
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
  
  // Handle diagnostic logging (tests/setup.ts)
  /^\[HANDLE_DIAG\]/, // Handle diagnostic logging for detecting leaked handles - tests/setup.ts
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
const unhandledRejectionHandler = (reason: unknown) => {
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
}

process.on('unhandledRejection', unhandledRejectionHandler)

// Clean up the unhandled rejection handler after all tests complete
// This prevents it from keeping the process alive
afterAll(() => {
  if (typeof process.removeListener === 'function') {
    process.removeListener('unhandledRejection', unhandledRejectionHandler)
  } else if (typeof process.off === 'function') {
    process.off('unhandledRejection', unhandledRejectionHandler)
  }

  // Diagnostic: Check for leaked handles after all tests complete
  // Always enabled for CI debugging - provides raw diagnostic data
  if (typeof (process as any)._getActiveHandles === 'function') {
    try {
      const handles = (process as any)._getActiveHandles()
      const requests = (process as any)._getActiveRequests()

      console.log('\n[HANDLE_DIAG] ========================================')
      console.log('[HANDLE_DIAG] RAW HANDLE DUMP AFTER ALL TESTS COMPLETE')
      console.log('[HANDLE_DIAG] ========================================')
      console.log(`[HANDLE_DIAG] Total Handles: ${handles.length}`)
      console.log(`[HANDLE_DIAG] Total Requests: ${requests.length}`)
      console.log('[HANDLE_DIAG] ========================================\n')

      // Log ALL handles with full details
      handles.forEach((handle: any, index: number) => {
        const handleType = handle.constructor?.name || 'Unknown'
        const handleTypeOf = typeof handle
        
        console.log(`[HANDLE_DIAG] HANDLE #${index + 1}`)
        console.log(`[HANDLE_DIAG]   TYPE: ${handleType}`)
        console.log(`[HANDLE_DIAG]   typeof: ${handleTypeOf}`)
        console.log(`[HANDLE_DIAG]   constructor.name: ${handle.constructor?.name || 'N/A'}`)
        
        // Log _handle details for Socket handles
        if (handle._handle) {
          console.log(`[HANDLE_DIAG]   _handle.constructor.name: ${handle._handle.constructor?.name || 'N/A'}`)
          if (handle._handle.owner) {
            const owner = handle._handle.owner
            console.log(`[HANDLE_DIAG]   _handle.owner.constructor.name: ${owner.constructor?.name || 'N/A'}`)
            
            // Check if it's an undici socket
            if (owner.constructor?.name === 'Client' || owner.constructor?.name === 'Pool') {
              console.log(`[HANDLE_DIAG]   SOCKET OWNER: undici ${owner.constructor.name}`)
            }
            
            // Check if it's a Supabase client socket
            if (owner.constructor?.name?.includes('Supabase') || owner.constructor?.name?.includes('PostgREST')) {
              console.log(`[HANDLE_DIAG]   SOCKET OWNER: Supabase/PostgREST`)
            }
            
            // Check if it's a Next.js fetch socket
            if (owner.constructor?.name?.includes('Next') || owner.constructor?.name?.includes('Fetch')) {
              console.log(`[HANDLE_DIAG]   SOCKET OWNER: Next.js fetch`)
            }
            
            if (owner && owner.stack) {
              console.log(`[HANDLE_DIAG]   STACK TRACE:`)
              const stackLines = owner.stack.split('\n').slice(0, 15)
              stackLines.forEach((line: string) => {
                console.log(`[HANDLE_DIAG]     ${line.trim()}`)
              })
            }
          }
        }
        
        // For Socket handles, check for additional identifying properties
        if (handleType === 'Socket') {
          // Check if socket has a client property (undici)
          if (handle._httpMessage) {
            console.log(`[HANDLE_DIAG]   _httpMessage.constructor.name: ${handle._httpMessage.constructor?.name || 'N/A'}`)
          }
          // Check for agent reference
          if (handle.agent) {
            console.log(`[HANDLE_DIAG]   agent.constructor.name: ${handle.agent.constructor?.name || 'N/A'}`)
          }
          // Check for client reference (undici)
          if ((handle as any).client) {
            console.log(`[HANDLE_DIAG]   client.constructor.name: ${(handle as any).client.constructor?.name || 'N/A'}`)
          }
        }
        
        // Log all relevant properties
        const props: string[] = []
        
        // Timer-specific properties
        if (handle._idleTimeout !== undefined) {
          props.push(`_idleTimeout: ${handle._idleTimeout}ms`)
        }
        if (handle._repeat !== undefined) {
          props.push(`_repeat: ${handle._repeat}`)
        }
        if (handle._onTimeout !== undefined) {
          props.push(`_onTimeout: ${typeof handle._onTimeout}`)
          if (handle._onTimeout && handle._onTimeout.toString) {
            const funcStr = handle._onTimeout.toString().substring(0, 100)
            props.push(`_onTimeout code: ${funcStr}...`)
          }
        }
        
        // Event emitter properties
        if (handle._listeners !== undefined) {
          props.push(`_listeners: ${Array.isArray(handle._listeners) ? handle._listeners.length : 'N/A'}`)
        }
        if (handle._events !== undefined) {
          const eventCount = typeof handle._events === 'object' ? Object.keys(handle._events).length : 0
          props.push(`_events: ${eventCount} event types`)
        }
        
        // Stream/socket properties
        if (handle.readable !== undefined) {
          props.push(`readable: ${handle.readable}`)
        }
        if (handle.writable !== undefined) {
          props.push(`writable: ${handle.writable}`)
        }
        if (handle.destroyed !== undefined) {
          props.push(`destroyed: ${handle.destroyed}`)
        }
        
        // Socket-specific
        if (handle.remoteAddress !== undefined) {
          props.push(`remoteAddress: ${handle.remoteAddress}`)
        }
        if (handle.remotePort !== undefined) {
          props.push(`remotePort: ${handle.remotePort}`)
        }
        
        // Process-specific
        if (handle.pid !== undefined) {
          props.push(`pid: ${handle.pid}`)
        }
        
        if (props.length > 0) {
          console.log(`[HANDLE_DIAG]   PROPERTIES:`)
          props.forEach(prop => {
            console.log(`[HANDLE_DIAG]     ${prop}`)
          })
        }
        
        // Try to get function source if it's a callback
        if (handle._onTimeout && handle._onTimeout.stack) {
          console.log(`[HANDLE_DIAG]   CALLBACK STACK:`)
          const callbackStack = handle._onTimeout.stack.split('\n').slice(0, 5)
          callbackStack.forEach((line: string) => {
            console.log(`[HANDLE_DIAG]     ${line.trim()}`)
          })
        }
        
        console.log('[HANDLE_DIAG] ---')
      })

      // Log ALL requests
      if (requests.length > 0) {
        console.log(`[HANDLE_DIAG] ACTIVE REQUESTS (${requests.length}):`)
        requests.forEach((req: any, index: number) => {
          const reqType = req.constructor?.name || 'Unknown'
          console.log(`[HANDLE_DIAG]   REQUEST #${index + 1}: ${reqType}`)
          if (req._handle && req._handle.owner && req._handle.owner.stack) {
            const stackLines = req._handle.owner.stack.split('\n').slice(0, 5)
            stackLines.forEach((line: string) => {
              console.log(`[HANDLE_DIAG]     ${line.trim()}`)
            })
          }
        })
      }

      // Summary by type
      const handleTypes = handles.map((handle: any) => handle.constructor?.name || 'Unknown')
      const typeCounts = handleTypes.reduce((acc: { [key: string]: number }, type: string) => {
        acc[type] = (acc[type] || 0) + 1
        return acc
      }, {})
      console.log('\n[HANDLE_DIAG] SUMMARY BY TYPE:')
      Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`[HANDLE_DIAG]   ${type}: ${count}`)
      })
      
      console.log('\n[HANDLE_DIAG] ========================================\n')
    } catch (e) {
      console.error('[HANDLE_DIAG] ERROR during handle diagnostic:', e)
      if (e instanceof Error && e.stack) {
        console.error('[HANDLE_DIAG] Stack:', e.stack)
      }
    }
  } else {
    console.log('[HANDLE_DIAG] process._getActiveHandles() not available\n')
  }
})

// FINAL DIAGNOSTIC: Run at the VERY END after all tests and hooks complete
// This runs on process exit events to capture the absolute final state
if (process.env.CI === 'true' && typeof (process as any)._getActiveHandles === 'function') {
  const logFinalHandles = () => {
    try {
      const handles = (process as any)._getActiveHandles()
      const requests = (process as any)._getActiveRequests()

      console.log('\n[FINAL_DIAG] ========================================')
      console.log('[FINAL_DIAG] ABSOLUTE FINAL HANDLE DUMP - PROCESS EXITING')
      console.log('[FINAL_DIAG] ========================================')
      console.log(`[FINAL_DIAG] Total Handles: ${handles.length}`)
      console.log(`[FINAL_DIAG] Total Requests: ${requests.length}`)
      console.log('[FINAL_DIAG] ========================================\n')

      handles.forEach((handle: any, index: number) => {
        const handleType = handle.constructor?.name || 'Unknown'
        
        console.log(`[FINAL_DIAG] HANDLE #${index + 1}`)
        console.log(`[FINAL_DIAG]   constructor.name: ${handleType}`)
        
        // Log _handle details
        if (handle._handle) {
          console.log(`[FINAL_DIAG]   _handle.constructor.name: ${handle._handle.constructor?.name || 'N/A'}`)
          if (handle._handle.owner) {
            const owner = handle._handle.owner
            console.log(`[FINAL_DIAG]   _handle.owner.constructor.name: ${owner.constructor?.name || 'N/A'}`)
            
            // Identify owner library
            const ownerName = owner.constructor?.name || ''
            if (ownerName === 'Client' || ownerName === 'Pool') {
              console.log(`[FINAL_DIAG]   OWNER: undici ${ownerName}`)
            } else if (ownerName.includes('Supabase') || ownerName.includes('PostgREST')) {
              console.log(`[FINAL_DIAG]   OWNER: Supabase/PostgREST`)
            } else if (ownerName.includes('Next') || ownerName.includes('Fetch')) {
              console.log(`[FINAL_DIAG]   OWNER: Next.js fetch`)
            } else if (ownerName) {
              console.log(`[FINAL_DIAG]   OWNER: ${ownerName}`)
            }
            
            // Stack trace
            if (owner.stack) {
              console.log(`[FINAL_DIAG]   STACK TRACE:`)
              const stackLines = owner.stack.split('\n').slice(0, 20)
              stackLines.forEach((line: string) => {
                console.log(`[FINAL_DIAG]     ${line.trim()}`)
              })
            }
          }
        }
        
        // Socket-specific properties
        if (handleType === 'Socket') {
          console.log(`[FINAL_DIAG]   destroyed: ${handle.destroyed !== undefined ? handle.destroyed : 'N/A'}`)
          console.log(`[FINAL_DIAG]   readable: ${handle.readable !== undefined ? handle.readable : 'N/A'}`)
          console.log(`[FINAL_DIAG]   writable: ${handle.writable !== undefined ? handle.writable : 'N/A'}`)
          if (handle.agent) {
            console.log(`[FINAL_DIAG]   agent.constructor.name: ${handle.agent.constructor?.name || 'N/A'}`)
          }
          if (handle._httpMessage) {
            console.log(`[FINAL_DIAG]   _httpMessage.constructor.name: ${handle._httpMessage.constructor?.name || 'N/A'}`)
          }
        }
        
        // Timer-specific properties
        if (handleType === 'Timeout' || handleType === 'Immediate') {
          if (handle._idleTimeout !== undefined) {
            console.log(`[FINAL_DIAG]   _idleTimeout: ${handle._idleTimeout}ms`)
          }
          if (handle._repeat !== undefined) {
            console.log(`[FINAL_DIAG]   _repeat: ${handle._repeat}`)
          }
        }
        
        console.log('[FINAL_DIAG] ---')
      })

      // Log requests
      if (requests.length > 0) {
        console.log(`[FINAL_DIAG] ACTIVE REQUESTS (${requests.length}):`)
        requests.forEach((req: any, index: number) => {
          const reqType = req.constructor?.name || 'Unknown'
          console.log(`[FINAL_DIAG]   REQUEST #${index + 1}: ${reqType}`)
          if (req._handle && req._handle.owner && req._handle.owner.stack) {
            const stackLines = req._handle.owner.stack.split('\n').slice(0, 10)
            stackLines.forEach((line: string) => {
              console.log(`[FINAL_DIAG]     ${line.trim()}`)
            })
          }
        })
      }

      // Summary
      const handleTypes = handles.map((handle: any) => handle.constructor?.name || 'Unknown')
      const typeCounts = handleTypes.reduce((acc: { [key: string]: number }, type: string) => {
        acc[type] = (acc[type] || 0) + 1
        return acc
      }, {})
      console.log('\n[FINAL_DIAG] SUMMARY BY TYPE:')
      Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`[FINAL_DIAG]   ${type}: ${count}`)
      })
      
      console.log('\n[FINAL_DIAG] ========================================\n')
    } catch (e) {
      console.error('[FINAL_DIAG] ERROR:', e)
    }
  }

  // Register on both beforeExit and exit to catch the absolute final state
  process.once('beforeExit', logFinalHandles)
  process.once('exit', () => {
    // Use synchronous logging for exit event
    try {
      const handles = (process as any)._getActiveHandles()
      const requests = (process as any)._getActiveRequests()
      console.log(`\n[FINAL_DIAG] EXIT EVENT - Handles: ${handles.length}, Requests: ${requests.length}\n`)
    } catch (e) {
      // Ignore errors in exit handler
    }
  })
}

