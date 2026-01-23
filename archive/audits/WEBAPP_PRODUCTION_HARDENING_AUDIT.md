# Webapp Production Hardening Audit (LootAura)

**Generated:** 2025-01-31  
**Scope:** Next.js webapp error handling, logging, monitoring, cron/email systems, map/search robustness, and release readiness.

---

## 1. Client Error Handling

### 1.1 Global Error Boundaries

**✅ Implemented:**

- **Global Error Boundary** (`components/system/ErrorBoundary.tsx`)
  - Wraps entire app in `app/layout.tsx` (line 95)
  - Catches React render errors in component tree
  - Logs errors via `logger.error()` with context
  - Sends errors to Sentry in production
  - Displays user-friendly fallback UI with sanitized error messages
  - Provides "Try Again" and "Go Home" actions

- **Next.js Error Page** (`app/error.jsx`)
  - Next.js 13+ error boundary for route-level errors
  - Sanitizes error messages before display
  - Only logs full error details in debug mode
  - Provides reset functionality

**File Paths:**
- `components/system/ErrorBoundary.tsx` - Global error boundary component
- `app/error.jsx` - Next.js error page
- `app/layout.tsx` - Root layout with ErrorBoundary wrapper

### 1.2 Route-Level Error Boundaries

**Status:** ⚠️ **Partial**

- **Auth Error Page** (`app/auth/error/page.tsx`)
  - Handles authentication-specific errors
  - Maps error codes to user-friendly messages
  - No explicit error boundary (relies on global)

**Gap:** No route-specific error boundaries for critical flows (sales, favorites, reviews)

### 1.3 Client-Side Error Reporting

**✅ Implemented:**

- **Sentry Integration** (`sentry.client.config.ts`)
  - Configured with DSN from `NEXT_PUBLIC_SENTRY_DSN`
  - Session replay enabled (10% sample rate in production)
  - Error replay at 100% sample rate
  - Text and media masking enabled for privacy
  - Traces sample rate: 10% in production, 100% in development

- **Error Boundary Reporting**
  - `ErrorBoundary.componentDidCatch()` sends errors to Sentry
  - Includes React component stack in error context
  - Only reports in production (`NODE_ENV === 'production'`)

**File Paths:**
- `sentry.client.config.ts` - Sentry client configuration
- `components/system/ErrorBoundary.tsx` - Error reporting in boundary

### 1.4 Component-Level Error Handling

**Patterns Observed:**

- **Try/Catch in Async Operations:**
  - `ProfileClient.tsx` - Wraps profile loading in try/catch, sets error state
  - `AccountClient.tsx` - Error handling for account operations
  - `DashboardClient.tsx` - Error handling for dashboard data loading

- **Error State Management:**
  - Components use `useState` for error messages
  - Errors displayed via toast notifications or inline messages
  - No consistent error handling pattern across all components

**Gaps:**
- Some components may not handle fetch errors gracefully
- No shared error handling hook (e.g., `useErrorHandler`)
- Inconsistent error message display (toast vs. inline vs. console)

### 1.5 Client Error Handling Summary

**✅ Strengths:**
- Global error boundary in place
- Sentry integration for error reporting
- Error message sanitization prevents information leakage
- Next.js error page for route-level errors

**⚠️ Gaps:**
- No route-specific error boundaries for critical flows
- Inconsistent component-level error handling
- No shared error handling utilities/hooks
- Some components may not handle async errors gracefully

---

## 2. Server/API Error Handling

### 2.1 Central Error Handling Utilities

**✅ Implemented:**

- **Error Sanitization** (`lib/errors/sanitize.ts`)
  - `sanitizeErrorMessage()` - Removes PostgREST codes, SQL errors, stack traces
  - `sanitizeErrorDetails()` - Strips sensitive details in production
  - Prevents information leakage to clients

- **HTTP Response Helpers** (`lib/http/json.ts`)
  - `ok()` - Success response helper
  - `fail()` - Failure response with sanitized details
  - Consistent error response shape: `{ ok: false, code, error, details? }`

- **Secure API Wrapper** (`lib/secureApi.ts`)
  - `createSecureApiHandler()` - Wraps API handlers with error handling
  - CSRF protection
  - Input sanitization hooks
  - Automatic error logging and Sentry reporting
  - Returns sanitized error responses

**File Paths:**
- `lib/errors/sanitize.ts` - Error sanitization utilities
- `lib/http/json.ts` - HTTP response helpers
- `lib/secureApi.ts` - Secure API handler wrapper

### 2.2 API Route Error Handling Patterns

**Analysis of 68 API routes with try/catch:**

**✅ Well-Handled Routes:**

- **Cron Endpoints:**
  - `/api/cron/favorites-starting-soon/route.ts` - Top-level try/catch, structured logging, Sentry reporting
  - `/api/cron/seller-weekly-analytics/route.ts` - Top-level try/catch, structured logging, Sentry reporting

- **Sales Endpoints:**
  - `/api/sales/route.ts` - Comprehensive error handling, validation, logging
  - `/api/sales/markers/route.ts` - Try/catch with detailed error responses
  - `/api/sales/count/route.ts` - Error handling with validation

- **Draft Publishing:**
  - `/api/drafts/publish/route.ts` - Try/catch with rollback logic, Sentry reporting

**⚠️ Routes Needing Review:**

- Some routes may not have top-level try/catch
- Inconsistent error response shapes (some use `fail()`, others use `NextResponse.json()`)
- Some routes may leak error details in development mode

### 2.3 Error Logging in API Routes

**Patterns:**

- **Central Logger Usage:**
  - Most routes import `logger` from `lib/log`
  - Structured logging with context (component, operation, userId, saleId)
  - Errors logged with `logger.error(message, error, context)`

- **Direct Console Usage:**
  - 370+ `console.log/error/warn` calls across 60 API files
  - Many are gated by `NEXT_PUBLIC_DEBUG === 'true'`
  - Some may log in production (needs review)

**Gaps:**
- Inconsistent logging patterns (logger vs. console)
- Some routes may not log errors at all
- No correlation IDs for request tracing

### 2.4 Server Error Handling Summary

**✅ Strengths:**
- Central error sanitization utilities
- HTTP response helpers for consistent error shapes
- Secure API wrapper available (not widely used)
- Most critical routes have try/catch
- Sentry integration for error reporting

**⚠️ Gaps:**
- Not all routes use `fail()` helper (inconsistent error responses)
- Many routes use direct `console.*` instead of `logger`
- No request correlation IDs
- Some routes may not have top-level error handling
- `secureApi` wrapper exists but is not widely adopted

---

## 3. Logging & Monitoring

### 3.1 Central Logging Utility

**✅ Implemented:**

- **Logger Class** (`lib/log.ts`)
  - Structured logging with context objects
  - Levels: `info`, `warn`, `error`, `debug`
  - Environment-aware (production vs. development)
  - Debug mode gating via `NEXT_PUBLIC_DEBUG`
  - Automatic Sentry integration for warnings/errors in production
  - Timestamp and component/operation tagging

**Features:**
- `logger.info()` - Logs in non-production or debug mode
- `logger.warn()` - Logs + sends to Sentry in production
- `logger.error()` - Always logs + sends to Sentry in production
- `logger.debug()` - Only logs in debug mode

**File Path:** `lib/log.ts`

### 3.2 Logging Usage Analysis

**Central Logger Usage:**
- Used in cron endpoints, job processor, some API routes
- Not universally adopted (many routes still use `console.*`)

**Direct Console Usage:**
- 370+ `console.*` calls across 60 API files
- Many are gated by `NEXT_PUBLIC_DEBUG === 'true'`
- Some may log in production (needs audit)

**Gaps:**
- Inconsistent logging (logger vs. console)
- No structured logging format enforced
- No log aggregation endpoint
- No PII scrubbing in logs (may include emails, user IDs)

### 3.3 External Monitoring Tools

**✅ Sentry Integration:**

- **Client-Side** (`sentry.client.config.ts`)
  - DSN: `NEXT_PUBLIC_SENTRY_DSN`
  - Session replay: 10% sample rate (production)
  - Error replay: 100% sample rate
  - Text/media masking enabled
  - Traces: 10% (production), 100% (development)

- **Server-Side** (`sentry.server.config.ts`)
  - DSN: `NEXT_PUBLIC_SENTRY_DSN`
  - Traces: 10% (production), 100% (development)
  - Debug mode in development

- **Edge Runtime** (`sentry.edge.config.ts`)
  - Similar configuration for edge functions

**Usage:**
- Error boundaries send errors to Sentry
- Logger sends warnings/errors to Sentry in production
- Job processor reports failures to Sentry
- Some API routes manually report to Sentry

**File Paths:**
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`

### 3.4 PII in Logs

**Potential Issues:**

- **User IDs:** Logged in context objects (`userId`, `saleId`)
- **Email Addresses:** May be logged in email sending code
- **Search Queries:** May include user input
- **Error Messages:** May include user data

**Mitigations:**
- Error sanitization removes stack traces and internal details
- Debug mode gating reduces production logging
- Sentry masking for session replay

**Gaps:**
- No explicit PII scrubbing in logger
- No log retention policy documented
- No audit of what gets logged

### 3.5 Logging & Monitoring Summary

**✅ Strengths:**
- Central logger utility with Sentry integration
- Structured logging with context
- Environment-aware logging levels
- Sentry configured for client, server, and edge

**⚠️ Gaps:**
- Inconsistent usage (logger vs. console)
- No PII scrubbing in logger
- No request correlation IDs
- No log aggregation/retention policy
- Many `console.*` calls may log in production

---

## 4. Cron & Email Runtime Behavior

### 4.1 Cron Endpoint Error Handling

**✅ Implemented:**

**`/api/cron/favorites-starting-soon`:**
- Top-level try/catch
- Structured logging (start, end, errors)
- Sentry reporting for failures
- Returns consistent JSON response shape
- Handles auth errors (NextResponse instances)
- Logs run metadata (runAt, env, emailsEnabled)

**`/api/cron/seller-weekly-analytics`:**
- Top-level try/catch
- Structured logging (start, end, errors)
- Sentry reporting for failures
- Returns consistent JSON response shape
- Handles optional date parameter
- Logs run metadata (runAt, env, dateParam)

**File Paths:**
- `app/api/cron/favorites-starting-soon/route.ts`
- `app/api/cron/seller-weekly-analytics/route.ts`

### 4.2 Cron Job Logging

**✅ Strengths:**
- Explicit logging of job start/end
- Logs when emails are disabled (no-op)
- Logs job completion with metadata
- Error logging with context

**Pattern:**
```typescript
logger.info('Job triggered', { component, runAt, env })
// ... job execution ...
logger.info('Job completed', { component, runAt, env })
// OR
logger.error('Job failed', error, { component, runAt, env, error })
```

### 4.3 Email Sending Error Handling

**✅ Implemented:**

**Email Helper** (`lib/email/sendEmail.ts`):
- Checks `LOOTAURA_ENABLE_EMAILS` before sending
- Validates `RESEND_FROM_EMAIL` or `EMAIL_FROM`
- Try/catch around Resend API calls
- Returns structured result: `{ ok: boolean, error?: string }`
- Logs errors but doesn't throw (emails are non-critical)
- Optional Sentry reporting for email failures

**Error Handling:**
- Configuration errors return failure (no send attempted)
- Resend API errors are caught and logged
- Errors sent to Sentry if available
- Non-blocking (doesn't throw, returns result)

**File Path:** `lib/email/sendEmail.ts`

### 4.4 Email Idempotency

**✅ Implemented:**

- **Favorite Sales Starting Soon:**
  - Uses `start_soon_notified_at` column on `favorites` table
  - Only processes favorites with `null` `start_soon_notified_at`
  - Updates column after successful email send
  - Prevents duplicate notifications

- **Seller Weekly Analytics:**
  - Uses time window calculation (last full week)
  - Idempotent by design (same week = same results)
  - No explicit idempotency key (relies on time window)

### 4.5 Cron & Email Summary

**✅ Strengths:**
- Comprehensive error handling in cron endpoints
- Structured logging with metadata
- Sentry reporting for failures
- Email sending is non-blocking and error-tolerant
- Idempotency mechanisms in place

**⚠️ Gaps:**
- No explicit job execution log table
- No retry mechanism for failed email sends
- No email delivery status tracking
- Cron job stats not exposed (emailsSent: 0 in response)

---

## 5. Map & Search Robustness

### 5.1 Bbox Validation

**✅ Implemented:**

- **Zod Schema Validation** (`app/api/sales/route.ts`)
  - `bboxSchema` validates lat/lng ranges (-90 to 90, -180 to 180)
  - Refines to ensure `north > south` and `east > west`
  - Returns 400 with clear error message on validation failure

**File Path:** `app/api/sales/route.ts` (lines 21-32)

### 5.2 Search Parameter Validation

**✅ Implemented:**

- **Distance Limits:**
  - `/api/sales/count/route.ts` - Caps radius at 160km: `Math.max(1, Math.min(parseFloat(radiusKm), 160))`
  - `/api/sales/markers/route.ts` - Defaults to 40km, no explicit max (uses limit cap)

- **Query Length Limits:**
  - `/api/sales/route.ts` - Caps search query at 64 characters: `if (q && q.length > 64) return 400`

- **Limit/Offset Validation:**
  - `/api/sales/route.ts` - Caps limit at 200: `Math.min(..., 200)`
  - `/api/sales/markers/route.ts` - Caps limit at 1000: `Math.min(limit, 1000)`

- **Date Range Validation:**
  - Uses `dateBounds.validateDateRange()` helper
  - Returns 400 with error message on invalid dates

**File Paths:**
- `app/api/sales/route.ts`
- `app/api/sales/markers/route.ts`
- `app/api/sales/count/route.ts`
- `lib/shared/dateBounds.ts` (validation helper)

### 5.3 Error Handling in Search Endpoints

**✅ Implemented:**

- **Sales Endpoint** (`/api/sales/route.ts`):
  - Top-level try/catch (wraps entire handler)
  - Validates bbox, distance, dates, query length
  - Returns structured error responses: `{ ok: false, error: string }`
  - Logs errors with context
  - Handles geocoding failures gracefully (returns empty result)

- **Markers Endpoint** (`/api/sales/markers/route.ts`):
  - Try/catch around query execution
  - Validates lat/lng (returns 400 if missing/invalid)
  - Returns structured error responses
  - Logs errors with context

**Gaps:**
- Some error responses may include database error codes (needs sanitization)
- `/api/sales/markers` and `/api/sales/count` do not use rate limiting (main `/api/sales` does)

### 5.4 Abuse Protection

**✅ Implemented:**

- **Rate Limiting** (`lib/rateLimit/withRateLimit.ts`):
  - Wrapper for API routes with rate limiting
  - Supports multiple policies
  - Returns 429 with rate limit headers
  - Logs rate-limited requests

**Usage:**
- `/api/sales/route.ts` uses `withRateLimit` wrapper with `SALES_VIEW_30S` and `SALES_VIEW_HOURLY` policies
- Auth endpoints use rate limiting (`AUTH_DEFAULT`, `AUTH_HOURLY`, `AUTH_CALLBACK`)
- Geocoding endpoints use rate limiting (`GEO_ZIP_SHORT`, `GEO_ZIP_HOURLY`, `GEO_SUGGEST_SHORT`, `GEO_REVERSE_SHORT`, `GEO_OVERPASS_SHORT`)
- Mutation endpoints use rate limiting (`MUTATE_MINUTE`, `MUTATE_DAILY`)
- Rating endpoint uses rate limiting (`RATING_MINUTE`, `RATING_HOURLY`)
- Admin endpoints use rate limiting (`ADMIN_TOOLS`, `ADMIN_HOURLY`)
- Policies defined in `lib/rateLimit/policies.ts`

**Rate Limiting Infrastructure:**
- Upstash Redis backend (configurable, falls back to in-memory)
- Environment variable: `RATE_LIMITING_ENABLED` (can be toggled)
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Policy`
- Soft limits with burst allowance (e.g., `SALES_VIEW_30S` has `burstSoft: 2`)

**Gaps:**
- `/api/sales/markers/route.ts` - No rate limiting applied
- `/api/sales/count/route.ts` - No rate limiting applied
- `/api/sales/search/route.ts` - No rate limiting applied
- No explicit bbox size limits (could allow huge queries)
- No explicit max radius enforcement in all endpoints

### 5.5 Map & Search Summary

**✅ Strengths:**
- Bbox validation with Zod schema
- Distance, query length, and limit caps
- Date range validation
- Rate limiting available (used in some endpoints)
- Error handling with structured responses

**⚠️ Gaps:**
- Not all endpoints use rate limiting
- No explicit bbox size limits (could allow huge queries)
- Some error responses may leak database details
- No explicit max radius in all endpoints

---

## 6. Release Gates & Checklists

### 6.1 Existing Documentation

**Files Searched:**
- `plan.md` - Not found
- `status.md` - Not found
- `checklist.md` - Not found
- `PRODUCTION_ENV.md` - Exists (environment variables)
- `OPERATIONS.md` - Exists (operations documentation)

**Status:** ⚠️ **No explicit release gates or checklists found**

### 6.2 Production Readiness Indicators

**From Code Analysis:**

- **Error Handling:** ✅ Global error boundary, API error handling
- **Logging:** ✅ Central logger, Sentry integration
- **Monitoring:** ✅ Sentry configured
- **Cron Jobs:** ✅ Error handling, logging, idempotency
- **Email System:** ✅ Error handling, non-blocking
- **Search Validation:** ✅ Parameter validation, rate limiting

**Missing:**
- No explicit SLOs defined
- No performance benchmarks
- No release checklist
- No "no console errors" definition

### 6.3 Release Gates Summary

**✅ Strengths:**
- Production hardening measures in place (error handling, logging, monitoring)
- Environment variable documentation (`PRODUCTION_ENV.md`)
- Operations documentation (`OPERATIONS.md`)

**⚠️ Gaps:**
- No explicit release gates or checklists
- No SLOs defined (map first paint, query latency, etc.)
- No "no console errors" definition
- No performance benchmarks
- No explicit production readiness checklist

---

## 7. Summary & Recommended Next Steps

### 7.1 What's Already in Place

**Client Error Handling:**
- ✅ Global error boundary (`ErrorBoundary` component)
- ✅ Next.js error page (`app/error.jsx`)
- ✅ Sentry integration for error reporting
- ✅ Error message sanitization

**Server/API Error Handling:**
- ✅ Central error sanitization utilities
- ✅ HTTP response helpers (`ok()`, `fail()`)
- ✅ Secure API wrapper available
- ✅ Most critical routes have try/catch
- ✅ Sentry integration

**Logging & Monitoring:**
- ✅ Central logger utility (`lib/log.ts`)
- ✅ Sentry configured (client, server, edge)
- ✅ Structured logging with context
- ✅ Environment-aware logging levels

**Cron & Email:**
- ✅ Comprehensive error handling in cron endpoints
- ✅ Structured logging with metadata
- ✅ Email sending is non-blocking and error-tolerant
- ✅ Idempotency mechanisms in place

**Map & Search:**
- ✅ Bbox validation with Zod
- ✅ Parameter validation (distance, query length, limits)
- ✅ Rate limiting available
- ✅ Error handling with structured responses

### 7.2 Where We Have Gaps

**Client Error Handling:**
- ⚠️ No route-specific error boundaries for critical flows
- ⚠️ Inconsistent component-level error handling
- ⚠️ No shared error handling utilities/hooks

**Server/API Error Handling:**
- ⚠️ Not all routes use `fail()` helper (inconsistent error responses)
- ⚠️ Many routes use direct `console.*` instead of `logger`
- ⚠️ No request correlation IDs
- ⚠️ `secureApi` wrapper not widely adopted

**Logging & Monitoring:**
- ⚠️ Inconsistent logging (logger vs. console)
- ⚠️ No PII scrubbing in logger
- ⚠️ No log aggregation/retention policy
- ⚠️ Many `console.*` calls may log in production

**Cron & Email:**
- ⚠️ No explicit job execution log table
- ⚠️ No retry mechanism for failed email sends
- ⚠️ Cron job stats not exposed in responses

**Map & Search:**
- ⚠️ Not all endpoints use rate limiting
- ⚠️ No explicit bbox size limits
- ⚠️ Some error responses may leak database details

**Release Gates:**
- ⚠️ No explicit release gates or checklists
- ⚠️ No SLOs defined
- ⚠️ No performance benchmarks

### 7.3 Concrete, Minimal Next Steps

**High Priority:**

1. **Standardize API Error Handling**
   - Create shared error handler wrapper and use it in all API routes
   - Migrate routes to use `fail()` helper for consistent error responses
   - Add request correlation IDs for tracing

2. **Standardize Logging**
   - Migrate `console.*` calls to `logger` utility
   - Add PII scrubbing to logger (remove emails, user IDs from logs)
   - Audit production logs for PII leakage

3. **Add Rate Limiting to All Search Endpoints**
   - Apply `withRateLimit` to `/api/sales/markers`, `/api/sales/count`, and `/api/sales/search`
   - Use `SALES_VIEW_30S` and `SALES_VIEW_HOURLY` policies (same as main `/api/sales` endpoint)
   - Add bbox size limits (max lat/lng range, e.g., max 10 degrees)
   - Document rate limit policies in API documentation

**Medium Priority:**

4. **Improve Client Error Handling**
   - Create shared error handling hook (`useErrorHandler`)
   - Add route-specific error boundaries for critical flows (sales, favorites)
   - Standardize error message display (toast vs. inline)

5. **Enhance Cron Job Observability**
   - Add job execution log table (`public.cron_job_runs`)
   - Expose job stats in cron endpoint responses (emailsSent, errors)
   - Add retry mechanism for failed email sends

6. **Add Release Gates**
   - Create production readiness checklist
   - Define SLOs (map first paint < 2s, API latency < 500ms)
   - Add "no console errors" definition for core flows

**Low Priority:**

7. **Improve Error Response Sanitization**
   - Audit all API routes for database error leakage
   - Ensure all error responses use `sanitizeErrorDetails()`
   - Add error response validation tests

8. **Add Log Aggregation**
   - Consider log aggregation service (Logtail, Datadog)
   - Implement log retention policy (30 days for errors, 7 days for info)
   - Add log search/query capabilities

---

**End of Report**

