# Release Audit Report - LootAura

**Date:** 2025-01-XX  
**Scope:** Enterprise / Stability / Security / Scalability / Performance  
**Method:** Read-only codebase scan with evidence-based findings

---

## Executive Summary

- **Enterprise Viability:** ✅ Core flows functional with error boundaries, observability via Sentry + structured logging, feature flags present
- **Stability:** ⚠️ WebView remount pattern identified, useEffect dependency risks, error boundaries present at root level
- **Security:** ⚠️ Service role client used in middleware (bypasses RLS), rate limiting gaps on critical endpoints, OAuth callback URL logging
- **Scalability:** ⚠️ Missing pagination on sales list, markers limit 1000, no result caching on high-traffic endpoints
- **Performance:** ⚠️ Mapbox bundle size concern, image optimization present, debouncing implemented for map interactions

**Release Blockers:** 5 critical issues identified with proven evidence (see Section F)

---

## A) Enterprise Viability

### A.1 Top 10 User-Critical Flows

| Flow | Entry Route | API Endpoint | Auth Required | Failure UX |
|------|-------------|--------------|---------------|------------|
| Browse sales (map) | `/sales` | `GET /api/sales/markers` | No | Error boundary + retry |
| Sale detail | `/sales/[id]` | `GET /api/sales/[id]` | No | 404 page |
| Create sale | `/sell/new` | `POST /api/sales` | Yes | Form validation + error toast |
| Edit sale | `/sell/[id]` | `PUT /api/sales/[id]` | Yes (owner) | Error toast |
| Favorites | `/favorites` | `GET /api/favorites_v2` | Yes | Empty state |
| Auth (email) | `/auth/signin` | `POST /api/auth/*` | No | Error message inline |
| Auth (Google) | `/auth/signin` | OAuth redirect | No | `/auth/error` page |
| Profile edit | `/account/edit` | `POST /api/profile/update` | Yes | Form validation |
| View profile | `/account` | `GET /api/profile` | Yes | Error boundary |
| Search sales | `/sales?q=...` | `GET /api/sales/search` | No | Empty results state |

**Evidence:**
- Routes: `app/sales/page.tsx:34`, `app/sell/new/page.tsx`, `app/(account)/account/edit/ProfileInfoForm.tsx:48`
- APIs: `app/api/sales/route.ts:35`, `app/api/profile/update/route.ts:13`
- Error handling: `app/error.jsx:1-50`, `app/not-found.jsx:1-31`

### A.2 Feature Flags / Environment Toggles

| Flag | Location | Default | Production Impact |
|------|----------|---------|-------------------|
| `EXPO_PUBLIC_NATIVE_HUD` | `mobile/app/index.tsx:13` | Unset (hidden) | Diagnostic HUD visibility |
| `NEXT_PUBLIC_DEBUG` | Multiple files | Unset | Console logging |
| `MAINTENANCE_MODE` | `middleware.ts:10` | `false` | Site-wide maintenance page |
| `PROMOTIONS_ENABLED` | `app/(dashboard)/dashboard/page.tsx:58` | Unset | Promotions feature |
| `PAYMENTS_ENABLED` | `app/(dashboard)/dashboard/page.tsx:59` | Unset | Payments feature |
| `GOOGLE_ENABLED` | `components/auth/GoogleSignInButton.tsx` | `!== 'false'` | Google OAuth button |

**Evidence:**
- `middleware.ts:10` - `const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';`
- `mobile/app/index.tsx:13` - `const isNativeHudEnabled = process.env.EXPO_PUBLIC_NATIVE_HUD === '1';`
- `components/auth/GoogleSignInButton.tsx` - `const isGoogleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED !== 'false'`

### A.3 Observability

**✅ Sentry Integration:**
- Client: `sentry.client.config.ts:1-44` - 10% sample rate (prod), 100% error replay
- Server: `sentry.server.config.ts:1-29` - 10% traces (prod)
- Edge: `sentry.edge.config.ts:1-19`
- Error boundaries: `components/system/ErrorBoundary.tsx` (referenced in `app/layout.tsx:10`)

**✅ Structured Logging:**
- Central logger: `lib/log.ts:1-99` - PII-safe conventions documented
- Usage: Cron jobs, job processor, some API routes
- Levels: `info`, `warn`, `error`, `debug`
- Production: Warnings/errors sent to Sentry (`lib/log.ts:82-89`)

**⚠️ Gaps:**
- Inconsistent usage: 370+ `console.*` calls vs. `logger` (grep results show many console.log calls)
- No request correlation IDs: Only operation IDs in sales API (`app/api/sales/route.ts:38`)
- Some routes may not log errors: Not all API routes use logger

**Evidence:**
- `lib/log.ts:1-99` - Logger implementation
- `sentry.*.config.ts` - Sentry configuration files
- `app/api/sales/route.ts:37-38` - Operation ID generation

---

## B) Stability

### B.1 Crash/White-Screen Risk Patterns

#### Blocker: WebView Key Remount Pattern
**Location:** `mobile/app/index.tsx:686-689`  
**Evidence:**
```tsx
<WebView
  ref={webViewRef}
  source={{ uri: currentUrl }}
  key={currentUrl}
```
**Impact:** Full WebView remount on every URL change, loses state, performance degradation  
**Fix Direction:** Remove `key` prop or use stable key based on initial URL only

#### High: Server Component Window Access
**Status:** ✅ No issues found  
**Evidence:** Searched for `window.` and `document.` in `app/` directory - no matches in server components

#### Medium: useEffect Missing Dependencies
**Location:** `components/auth/AuthStateRefresher.tsx:18-63`  
**Evidence:**
```tsx
useEffect(() => {
  // ... uses pathname but not in dependency array
  checkAuthAndRefresh()
}, []) // Missing: pathname, queryClient
```
**Impact:** May not refresh auth state when navigating between routes  
**Fix Direction:** Add `pathname` and `queryClient` to dependency array

#### Medium: Navigation Interception Risk
**Location:** `mobile/app/index.tsx:599`  
**Evidence:** `handleShouldStartLoadWithRequest` function exists but implementation not fully visible in audit  
**Impact:** May block legitimate navigation  
**Fix Direction:** Review navigation blocking logic, ensure it doesn't block OAuth callbacks

### B.2 Error Boundaries

**✅ Root Error Boundary:**
- `app/error.jsx:1-50` - Sanitizes errors, shows user-friendly message with reset button

**✅ Not Found Handler:**
- `app/not-found.jsx:1-31` - 404 page with home link

**✅ Component Error Boundary:**
- `components/system/ErrorBoundary.tsx` - Referenced in `app/layout.tsx:10`

**⚠️ Gaps:**
- Not all route groups have route-specific error boundaries
- Some API routes may not have try/catch (cannot verify without reading all routes)

**Evidence:**
- `app/error.jsx:1-50` - Root error boundary
- `app/not-found.jsx:1-31` - 404 handler
- `app/layout.tsx:10` - ErrorBoundary import

### B.3 Mobile WebView Host

**✅ Fallback Behavior:**
- `mobile/app/index.tsx:674-683` - Error state with retry button when WebView fails to load

**✅ Linking Handlers:**
- Cold start: `mobile/app/index.tsx:153-216` - Handles OAuth callback via router params
- Warm start: `mobile/app/index.tsx:217-304` - Handles Linking events when app running

**✅ HUD Gating:**
- `mobile/app/index.tsx:13` - `isNativeHudEnabled` check
- `mobile/app/index.tsx:661-667` - HUD only renders when flag set, doesn't affect logic

**⚠️ Risks:**
- WebView remount on every URL change (see B.1)
- No timeout handling visible for failed loads

**Evidence:**
- `mobile/app/index.tsx:153-304` - Linking handlers
- `mobile/app/index.tsx:661-667` - HUD conditional rendering
- `mobile/app/index.tsx:674-683` - Error fallback UI

### B.4 Top 10 Stability Risks

1. **WebView key remount** - `mobile/app/index.tsx:689` - **Blocker**
2. **useEffect missing deps** - `components/auth/AuthStateRefresher.tsx:18` - **Medium**
3. **Autosave loop risk** - `app/sell/new/SellWizardClient.tsx:657` - Complex dependencies - **Medium**
4. **No API timeout** - Multiple routes - Cannot verify without reading all - **Low**
5. **Error boundary coverage** - Some routes - Missing route-specific boundaries - **Medium**
6. **WebView navigation blocking** - `mobile/app/index.tsx:599` - May block legitimate navigation - **Low**
7. **Realtime subscription cleanup** - `lib/hooks/useRealtime.ts` - May leak subscriptions - **Low**
8. **Window event listener cleanup** - `app/(account)/profile/ProfileClient.tsx:174-178` - Cleanup present - **Low**
9. **Cookie setting failures** - `lib/auth/server-session.ts:52-61` - Silent failures in middleware - **Low**
10. **Missing validation** - Some API routes - Cannot verify all routes - **Medium**

**Reproduction Notes:**
- WebView remount: Navigate rapidly in mobile app, observe full remounts in logs
- useEffect loop: Sign in, navigate to different routes, check console for repeated calls
- Autosave: Create sale draft, make rapid changes, observe save frequency in network tab

---

## C) Security

### C.1 Supabase RLS Compliance

#### Blocker: Service Role in Middleware
**Location:** `lib/auth/server-session.ts:42-45`  
**Evidence:**
```typescript
export function createServerSupabaseClient(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,  // ⚠️ Service role
```
**Impact:** Bypasses RLS policies, allows access to any user's data  
**Used in:** Middleware (`middleware.ts:351`), OAuth callbacks (`app/api/auth/callback/route.ts:53`)  
**Fix Direction:** Replace with RLS-aware client (`createSupabaseServerClient` from `lib/supabase/server.ts`)

**✅ Correct Usage:**
- `lib/supabase/server.ts:15-52` - `createSupabaseServerClient` uses anon key (RLS-aware)
- `lib/supabase/clients.ts:6-37` - `getRlsDb` uses anon key with cookie auth
- User mutations: `app/api/profile/update/route.ts:123-128` - Uses `getRlsDb()` (RLS-aware)

**Evidence:**
- `lib/auth/server-session.ts:42-45` - Service role usage
- `app/api/profile/update/route.ts:123` - Correct RLS usage: `const rls = getRlsDb()`
- `middleware.ts:351` - Uses service role client: `.from('profiles_v2')`

### C.2 API Route Validation

**✅ Zod Validation Present:**
- Profile update: `app/api/profile/update/route.ts:8,79` - `ProfileUpdateSchema.safeParse(body)`
- Items: `app/api/items_v2/route.ts:10-26` - `ItemV2InputSchema` with refine
- Sales (v2): `app/api/v2/sales/route.ts:68-80` - Manual validation with required fields check

**⚠️ Missing Validation:**
- Sales (legacy): `app/api/sales/route.ts:1123-1135` - Manual validation, no Zod schema
- Some GET endpoints - Query params not validated with Zod

**Evidence:**
- `app/api/profile/update/route.ts:8` - `import { ProfileUpdateSchema } from '@/lib/validators/profile'`
- `app/api/profile/update/route.ts:79` - `const validationResult = ProfileUpdateSchema.safeParse(body)`
- `app/api/sales/route.ts:1123-1135` - Manual validation: `if (!title || typeof title !== 'string'...)`

### C.3 OAuth Callback Security

**✅ Strengths:**
- No token logging: OAuth callbacks log boolean flags, not actual codes
- URL validation: `mobile/app/utils/authCallbackValidator.ts` - Strict validation function exists
- Error handling: Redirects to `/auth/error` on failure

**⚠️ High: OAuth Callback URL Logging**
**Location:** `app/auth/callback/route.ts:35-40`  
**Evidence:**
```typescript
console.log('[AUTH_CALLBACK] Processing OAuth callback:', {
  hasCode: !!code,
  hasError: !!error,
  redirectTo,
  url: url.href  // ⚠️ Logs full URL which may contain code param
})
```
**Impact:** May log sensitive OAuth codes in query parameters  
**Fix Direction:** Remove `url.href` from logs, log only structure (hasCode, hasError, redirectTo)

**Evidence:**
- `app/auth/callback/route.ts:35-40` - Full URL logged
- `mobile/app/index.tsx:197-201` - Logs callback URL structure (safer, but still logs path)

### C.4 Secrets/Environment Variables

**✅ Correct:**
- No secrets in code: All secrets in environment variables
- Service role: Only used server-side (but in wrong places - see C.1)
- API keys: Not committed (`.env.example` exists without actual keys)

**Evidence:**
- `.env.example` file exists (cannot verify contents without reading, but presence indicates pattern)
- No hardcoded API keys found in codebase search

### C.5 Rate Limiting

**✅ Infrastructure Present:**
- Wrapper: `lib/rateLimit/withRateLimit.ts:20-101` - Upstash Redis integration
- Policies: `lib/rateLimit/policies.ts:17-36` - Named policies defined
- Coverage: Promotions (`app/api/promotions/intent/route.ts:347`), admin tools, geocoding

**⚠️ Blocker: Missing Rate Limiting on Critical Endpoints**
- Sales GET: `app/api/sales/route.ts` - No `withRateLimit` wrapper - **High traffic endpoint**
- Profile update: `app/api/profile/update/route.ts` - No `withRateLimit` wrapper - **Mutation endpoint**
- Markers: `app/api/sales/markers/route.ts:400` - ✅ Rate-limited (`SALES_VIEW_30S`, `SALES_VIEW_HOURLY`)

**Evidence:**
- `lib/rateLimit/policies.ts:17-36` - Policy definitions
- `app/api/sales/markers/route.ts:400` - `export const GET = withRateLimit(markersHandler, ...)`
- `app/api/sales/route.ts:35` - No rate limiting wrapper on `salesHandler`
- `app/api/profile/update/route.ts:13` - No rate limiting wrapper on `updateProfileHandler`

### C.6 Security Summary

**Status:** ⚠️ **Needs Attention**

**Blockers:**
1. Service role in middleware bypasses RLS - **Blocker**
2. Missing rate limiting on critical endpoints - **Blocker**
3. OAuth callback URL logging - **High**

**Pass:**
- RLS policies present (but bypassed by service role)
- CSRF protection on mutations (`lib/api/csrfRoutes.ts:10-33`)
- Secrets not committed
- Webhook idempotency (Stripe: `app/api/webhooks/stripe/route.ts:66-103`)

---

## D) Scalability

### D.1 Viewport/Map Endpoints

**✅ Bounding Box Queries:**
- `/api/sales` - Accepts `north`, `south`, `east`, `west` params (`app/api/sales/route.ts:54-57`)
- `/api/sales/markers` - Accepts `lat`, `lng`, `distanceKm` (`app/api/sales/markers/route.ts:23-25`)
- PostGIS spatial queries: `lib/data/sales.ts:148-169` - Uses `search_sales_within_distance` RPC

**⚠️ High: Result Caps**
- Markers: `app/api/sales/markers/route.ts:41` - Limit: 1000 (hardcoded: `Math.min(limit, 1000)`)
- Sales list: `app/api/sales/route.ts` - No explicit limit visible in handler
- No pagination: Results returned as single array

**Evidence:**
- `app/api/sales/markers/route.ts:41` - `const limit = Number.isFinite(parseFloat(String(limitParam))) ? Math.min(parseInt(String(limitParam), 10), 1000) : 1000`
- `app/api/sales/route.ts:200-247` - Bbox parsing logic, no limit enforcement visible

### D.2 Pagination

**⚠️ Blocker: Missing Pagination**
- Sales list: `app/api/sales/route.ts` - No offset/limit pagination params
- Markers: `app/api/sales/markers/route.ts` - Limit only, no offset
- Favorites: `/api/favorites_v2` - Cannot verify without reading file

**✅ Present:**
- Dashboard: `app/(dashboard)/dashboard/page.tsx:35` - `limit: 24` for sales (client-side)
- Drafts: `app/(dashboard)/dashboard/page.tsx:36` - `limit: 12, offset: 0` (client-side)

**Evidence:**
- `app/api/sales/route.ts:35-1367` - No pagination params in handler signature
- `app/(dashboard)/dashboard/page.tsx:35-36` - Client-side limits only

### D.3 N+1 Query Risks

**⚠️ Potential Issues:**
- Sale detail with items: May fetch items separately (cannot verify without reading sale detail API)
- Profile with sales: Dashboard fetches in parallel (`app/(dashboard)/dashboard/page.tsx:34-40`)

**✅ Mitigations:**
- Parallel fetching: `Promise.all` used in dashboard
- RPC functions: `search_sales_within_distance` reduces round trips (`lib/data/sales.ts:152-162`)

**Evidence:**
- `app/(dashboard)/dashboard/page.tsx:34-40` - `Promise.all([salesResult, draftsResult, profile, metrics, archivedCount])`
- `lib/data/sales.ts:152-162` - RPC usage: `supabase.rpc('search_sales_within_distance', ...)`

### D.4 Media Pipeline

**✅ Cloudinary:**
- Image optimization: `next.config.js:11` - Cloudinary domain allowed: `hostname: 'res.cloudinary.com'`
- Transformations: Cloudinary handles transforms (domain configured)
- Caching: CDN caching headers present (`app/api/sales/markers/route.ts:383-387`)

**Evidence:**
- `next.config.js:11` - `hostname: 'res.cloudinary.com'`
- `app/api/sales/markers/route.ts:383-387` - Cache headers: `'Cache-Control': 'public, max-age=120, s-maxage=600'`

### D.5 Webhooks/Queues

**✅ Stripe Webhooks:**
- Idempotency: `app/api/webhooks/stripe/route.ts:66-103` - Event ID tracking in `stripe_webhook_events` table
- Signature verification: `app/api/webhooks/stripe/route.ts:54-64` - `stripe.webhooks.constructEvent`
- Error handling: Updates event record on failure (`app/api/webhooks/stripe/route.ts:109-116`)

**⚠️ Unknown:**
- Resend webhooks: Not found in codebase search
- Queue system: Job processor exists (`lib/jobs/processor.ts`) but cannot verify idempotency without reading

**Evidence:**
- `app/api/webhooks/stripe/route.ts:66-103` - Idempotency check: `await fromBase(admin, 'stripe_webhook_events').select('id, processed_at, error_message').eq('event_id', event.id).maybeSingle()`
- `supabase/migrations/124_create_stripe_webhook_events_table.sql` - Event tracking table with `event_id` UNIQUE constraint

### D.6 Scalability Summary

**Top 5 Risks:**
1. **No pagination on sales list** - Can return 1000+ results - **Blocker**
2. **Markers limit 1000** - May be insufficient for large metropolitan areas - **High**
3. **No result caching** - Repeated queries hit database - **Medium**
4. **N+1 in sale detail** - Cannot verify without reading API - **Low**
5. **No query result limits** - Some endpoints have no caps - **Medium**

**Suggested Fixes:**
- Add `offset`/`limit` params to `/api/sales` GET handler
- Implement cursor-based pagination for markers
- Add Redis caching for frequent queries (markers, sales list)
- Batch item fetching in sale detail API
- Enforce max limits on all list endpoints (e.g., max 500 results)

---

## E) Performance

### E.1 Bundle Hotspots

**⚠️ High: Heavy Libraries:**
- Mapbox GL: `package.json:60` - `"mapbox-gl": "^3.5.1"` - Large bundle (~500KB+)
- React Map GL: `package.json:70` - `"react-map-gl": "^7.1.7"` - Wrapper adds size
- PhotoSwipe: `package.json:64` - `"photoswipe": "^5.4.4"` - Image gallery
- Recharts: `package.json:77` - `"recharts": "^2.12.7"` - Charts library

**✅ Optimizations:**
- Package imports: `next.config.js:144` - `optimizePackageImports: ['react-virtuoso']`
- Dynamic imports: Mapbox telemetry disabled (`lib/maps/telemetry.ts:1-39`)

**Evidence:**
- `package.json:60-70` - Heavy dependencies listed
- `next.config.js:144` - `optimizePackageImports: ['react-virtuoso']`
- `lib/maps/telemetry.ts:1-39` - Telemetry disabled: `(window as any).__MAPBOX_TELEMETRY__ = false`

### E.2 Map Rendering

**✅ Optimizations:**
- Clustering: `lib/pins/hybridClustering.ts` - Clustering logic exists (file referenced)
- Debouncing: `app/sales/SalesClient.tsx:317` - `fetchMapSales` callback with debounce
- Limit enforcement: Markers API limits to 1000 (`app/api/sales/markers/route.ts:41`)

**⚠️ Concerns:**
- Full remount on navigation: WebView key remount loses state (see B.1)
- No marker virtualization: All markers rendered (cannot verify without reading component)

**Evidence:**
- `app/sales/SalesClient.tsx:317` - `const fetchMapSales = useCallback(async (bufferedBbox: Bounds | null, ...)`
- `lib/pins/hybridClustering.ts` - File exists (referenced in search results)
- `app/api/sales/markers/route.ts:41` - Limit enforcement

### E.3 Critical-Path Endpoints

**Initial Render:**
- `/sales` - Fetches markers + sales list (parallel - cannot verify without reading component)
- `/api/sales/markers` - Cached 2min client, 10min CDN (`app/api/sales/markers/route.ts:383-387`)
- `/api/sales` - No caching headers visible

**Map Interactions:**
- Viewport change: Debounced (cannot verify debounce timing without reading component)
- Marker click: Fetches sale detail (cannot verify without reading component)

**Evidence:**
- `app/api/sales/markers/route.ts:383-387` - Cache headers: `'Cache-Control': 'public, max-age=120, s-maxage=600'`
- `app/api/sales/route.ts` - No cache headers in response (cannot verify all code paths)

### E.4 Image Optimization

**✅ Next/Image:**
- Usage: `app/sales/[id]/SaleDetailClient.tsx:31-115` - `ItemImage` component uses Next/Image
- Fallback: Regular `img` tag if Next/Image fails (`app/sales/[id]/SaleDetailClient.tsx:69-76`)
- Cloudinary: Domain allowed in `next.config.js:11`

**⚠️ Concerns:**
- Unoptimized mode: Used for blob/data URLs (correct: `app/sales/[id]/SaleDetailClient.tsx:87`)
- No lazy loading: Cannot verify without reading component fully

**Evidence:**
- `app/sales/[id]/SaleDetailClient.tsx:31-115` - `ItemImage` component
- `app/sales/[id]/SaleDetailClient.tsx:87` - `const shouldUnoptimize = src.startsWith('blob:') || src.startsWith('data:')`
- `next.config.js:11` - Cloudinary hostname configured

### E.5 Performance Summary

**P0 (Critical):**
- Mapbox bundle size - Affects initial load time - **High**
- WebView remount - Performance degradation on mobile - **Blocker** (see B.1)

**P1 (High):**
- No image lazy loading - Affects sale detail pages - **Medium** (cannot verify)
- No marker virtualization - Large marker counts - **Medium** (cannot verify)

**P2 (Medium):**
- Missing query result caching - Some endpoints - **Medium**
- No code splitting for heavy components - **Low** (cannot verify without build analysis)

**Quick Wins:**
- Add `loading="lazy"` to images (if not already present)
- Implement marker virtualization for large marker sets
- Code split map components (dynamic import)
- Add query result caching (Redis) for markers endpoint

---

## F) Release Blockers

### Critical Issues (Must Fix Before Release)

1. **Service role in middleware bypasses RLS**
   - **File:** `lib/auth/server-session.ts:42-45`
   - **Impact:** Security - Allows access to any user's data, bypasses RLS policies
   - **Fix Direction:** Replace `createServerSupabaseClient` usage in middleware with `createSupabaseServerClient` from `lib/supabase/server.ts` (uses anon key, RLS-aware)

2. **Missing rate limiting on critical endpoints**
   - **Files:** `app/api/sales/route.ts:35`, `app/api/profile/update/route.ts:13`
   - **Impact:** Security/Stability - Vulnerable to abuse, DoS risk
   - **Fix Direction:** Wrap handlers with `withRateLimit` using appropriate policies (e.g., `SALES_VIEW_HOURLY` for sales GET, `MUTATE_MINUTE` for profile update)

3. **WebView key remount on every navigation**
   - **File:** `mobile/app/index.tsx:689`
   - **Impact:** Performance - Full remount loses state, slow navigation
   - **Fix Direction:** Remove `key={currentUrl}` prop or use stable key based on initial URL only

4. **No pagination on sales list queries**
   - **File:** `app/api/sales/route.ts:35-1367`
   - **Impact:** Scalability - Can return 1000+ results, memory/network issues
   - **Fix Direction:** Add `offset` and `limit` query params, enforce max limit (e.g., 500), return pagination metadata

5. **OAuth callback URL logging**
   - **File:** `app/auth/callback/route.ts:35-40`
   - **Impact:** Security - May log sensitive OAuth codes in query parameters
   - **Fix Direction:** Remove `url: url.href` from log statement, log only structure (hasCode, hasError, redirectTo)

---

## G) Recommended Release Checklist

### Production/Vercel Verifications

**Pre-Deploy:**
- [ ] Verify `assetlinks.json` accessible: `curl -I https://lootaura.com/.well-known/assetlinks.json`
- [ ] Check Content-Type header: `application/json; charset=utf-8` (configured in `next.config.js:130-137`)
- [ ] Verify no redirects on `.well-known` paths (bypass configured in `middleware.ts:42,64`)
- [ ] Confirm Sentry DSN configured in Vercel environment variables
- [ ] Verify rate limiting Redis connection (Upstash) - check `RATE_LIMITING_ENABLED` and Redis URL
- [ ] Check environment variables: `SUPABASE_SERVICE_ROLE`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SENTRY_DSN`
- [ ] Verify Android App Links fingerprint matches Play Console (`public/.well-known/assetlinks.json`)

**Post-Deploy:**
- [ ] Monitor Sentry for errors (first 24 hours) - Check for RLS bypass errors, rate limit violations
- [ ] Check Vercel Analytics for performance metrics - Initial load time, TTFB
- [ ] Verify OAuth flows (Google + email) - Test sign-in, check for PKCE errors
- [ ] Test mobile app (Android App Links) - Verify OAuth returns to app, not browser
- [ ] Load test `/api/sales/markers` endpoint - Verify rate limiting works, check response times
- [ ] Verify rate limiting working - Check response headers for `X-RateLimit-*` on protected endpoints
- [ ] Monitor database query performance - Check Supabase dashboard for slow queries
- [ ] Check Cloudinary image delivery - Verify images load, check CDN cache hit rates
- [ ] Test maintenance mode - Set `MAINTENANCE_MODE=true`, verify `.well-known` still accessible

**Ongoing:**
- [ ] Review Sentry errors weekly - Focus on RLS errors, rate limit violations, OAuth failures
- [ ] Monitor rate limit violations - Check Upstash Redis for blocked requests
- [ ] Check database query times - Review Supabase slow query logs
- [ ] Review bundle sizes - Check Next.js build output for bundle size increases
- [ ] Monitor mobile app crash reports - Check for WebView remount issues, navigation failures
- [ ] Verify Android App Links status - Check device settings for "Supported web addresses" toggle

**UNPROVEN (Requires Production Verification):**
- Actual bundle sizes (requires `next build` output analysis)
- Real-world query performance (requires Supabase query logs)
- Mobile app crash rates (requires crash reporting service)
- Rate limiting effectiveness (requires Upstash metrics)
- Image optimization effectiveness (requires Cloudinary analytics)

---

**End of Report**
