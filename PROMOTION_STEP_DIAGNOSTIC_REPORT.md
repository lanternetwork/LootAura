# Promotion Step Missing After OAuth - Diagnostic Report

## Executive Summary

**Conclusion**: The `force-dynamic` fix is **UNNECESSARY** and likely masks the real issue. The page was already dynamically rendered due to `headers()` usage. The root cause is likely a **client-side hydration/timing issue** or **prop passing bug**, not server-side caching.

**Answer to Key Questions**:
1. **Was caching definitively responsible?** → **NO** (page was already dynamic)
2. **What exact invariant was violated?** → **UNKNOWN** (requires runtime debugging)
3. **Is `force-dynamic` necessary?** → **NO** (redundant)
4. **Smallest theoretically correct fix?** → **Remove `force-dynamic`, add client-side prop validation**

---

## 1. CONFIRM WHETHER app/sell/new/page.tsx WAS ACTUALLY CACHED

### Analysis

**Before the fix** (commit `bfba6a71^`):
- No `export const dynamic = 'force-dynamic'`
- Uses `headers()` from `next/headers` (line 14)
- Uses `fetch()` with `cache: 'no-store'` (line 26)

**Next.js 14 App Router Behavior**:
According to Next.js documentation, using `headers()` in a server component **automatically forces dynamic rendering**. The page cannot be statically generated or cached when `headers()` is called.

**Conclusion**: The page was **ALREADY DYNAMIC** before the fix. Next.js would have rendered it on every request due to `headers()` usage.

**Rendering Mode**: Dynamic Server Component (forced by `headers()`, not by explicit `dynamic` export)

---

## 2. TRACE REAL INPUTS TO `promotionsEnabled`

### Code Path Analysis

```typescript
// app/sell/new/page.tsx:40
const promotionsEnabled = process.env.PROMOTIONS_ENABLED === 'true'
```

**Inputs**:
- **ONLY**: `process.env.PROMOTIONS_ENABLED` (environment variable)
- **NOT dependent on**:
  - Auth state (no session/cookie checks)
  - User presence (no `user` variable)
  - Draft state (no draft checks)
  - Request headers (except for location, unrelated)
  - Cookies (not accessed)
  - Query parameters (not accessed)

**Computation**: Pure environment variable check, evaluated once per server render.

**Prop Flow**:
1. Server: `process.env.PROMOTIONS_ENABLED === 'true'` → `promotionsEnabled` boolean
2. Server → Client: Passed as prop to `SellWizardClient`
3. Client → ReviewStep: Passed as prop to `ReviewStep`
4. ReviewStep: Conditionally renders promotion section: `{promotionsEnabled && <div>...}`

**Conclusion**: `process.env.PROMOTIONS_ENABLED` is the **ONLY** input. No auth, session, or request-dependent logic affects this value.

---

## 3. AUTH TIMING VS INITIAL RENDER

### Server-Side Auth State

**Server Component** (`app/sell/new/page.tsx`):
- Does **NOT** check auth state
- Does **NOT** access cookies for auth
- Does **NOT** read session
- `promotionsEnabled` is computed **independently** of auth

**Client Component** (`SellWizardClient.tsx`):
- Checks auth in `useEffect` (line 193-218)
- Auth check is **asynchronous** (`supabase.auth.getUser()`)
- Auth state change listener set up after initial render
- `user` state initialized as `null` (line 79)

**Timing Analysis**:
1. **Server render**: `promotionsEnabled` computed from env var (no auth dependency)
2. **Client hydration**: `SellWizardClient` receives `promotionsEnabled` prop
3. **Client mount**: `user` state is `null` initially
4. **Client useEffect**: Auth check runs asynchronously
5. **ReviewStep render**: Uses `promotionsEnabled` prop (not `user` state)

**Conclusion**: Auth timing **CANNOT** affect `promotionsEnabled` because:
- Server-side computation is auth-independent
- Client-side prop is passed before auth check completes
- ReviewStep uses prop, not auth state

**However**: If there's a hydration mismatch or prop passing bug, the prop might not reach ReviewStep correctly.

---

## 4. RESUME PATH EFFECT

### Resume Logic Analysis

**Resume Parameter Handling** (`SellWizardClient.tsx:378-551`):
- `resume=review` is read from `searchParams` (line 382)
- If `resume === 'review'`, sets `currentStep` to `STEPS.REVIEW` (line 515)
- Does **NOT** affect `promotionsEnabled` prop
- Does **NOT** modify promotion section visibility

**Code Path**:
```typescript
// Line 382-383
const resume = searchParams.get('resume')
const isReviewResume = resume === 'review'

// Line 514-515
if (isReviewResume) {
  setCurrentStep(STEPS.REVIEW)  // Only affects step, not promotionsEnabled
}
```

**ReviewStep Rendering** (line 1206-1219):
- Receives `promotionsEnabled` as prop (line 1215)
- No conditional logic based on `resume` parameter
- Promotion section renders if `promotionsEnabled === true` (line 2097)

**Conclusion**: Resume path **DOES NOT** affect promotion visibility. The `resume=review` parameter only sets the current step, not the `promotionsEnabled` prop.

**Comparison**:
- Logged-in user visiting `/sell/new?resume=review`: `promotionsEnabled` from server prop
- OAuth return visiting `/sell/new?resume=review`: `promotionsEnabled` from server prop
- **No divergence expected** - both paths receive the same server prop

---

## 5. CLIENT VS SERVER MISMATCH CHECK

### Prop Flow Verification

**Server → Client Prop Passing**:
```typescript
// Server (page.tsx:53)
<SellWizardClient promotionsEnabled={promotionsEnabled} ... />

// Client (SellWizardClient.tsx:65)
promotionsEnabled = false,  // Default prop value
```

**Potential Issue**: If server renders with `promotionsEnabled = true` but client receives `false`, there could be a hydration mismatch.

**Client → ReviewStep Prop Passing**:
```typescript
// SellWizardClient.tsx:1215
<ReviewStep promotionsEnabled={promotionsEnabled} ... />

// ReviewStep.tsx:1970
promotionsEnabled?: boolean  // Optional prop
```

**Potential Issue**: If `promotionsEnabled` prop is not passed correctly, ReviewStep would use `undefined`, which is falsy.

**Debug Logging Added** (in current fix):
- Server: `[SELL_NEW_PAGE] Rendering with flags: { promotionsEnabled, paymentsEnabled }`
- Client: `[SELL_WIZARD] Rendering ReviewStep with promotionsEnabled: ...`
- ReviewStep: `[REVIEW_STEP] Promotion section render check: { promotionsEnabled, shouldRender: ... }`

**Conclusion**: Requires **runtime debugging** to confirm. The logs will show:
- Server-computed value
- Client-received value
- ReviewStep render decision

**Hypothesis**: If server logs `promotionsEnabled: true` but client logs `promotionsEnabled: false`, there's a prop passing bug or hydration mismatch.

---

## 6. CACHING HYPOTHESIS VERIFICATION

### Was the Server Component Cached?

**Evidence Against Caching**:
1. Page uses `headers()` → **forces dynamic rendering** (Next.js 14 behavior)
2. Page uses `fetch()` with `cache: 'no-store'` → **prevents caching**
3. No `generateStaticParams`, `revalidate`, or static generation hints
4. Page was **already dynamic** before `force-dynamic` was added

**Evidence For Caching** (if any):
- None found in code analysis
- No ISR configuration
- No static generation markers

**Conclusion**: The server component was **NOT cached**. It was already dynamically rendered due to `headers()` usage.

**Was `force-dynamic` necessary?** → **NO**. It's redundant because `headers()` already forces dynamic rendering.

**Was the component re-rendered after OAuth?** → **YES**. Dynamic components re-render on every request.

**Would a narrower fix be sufficient?** → **YES**. If the issue is prop passing or hydration, fixing that would be more targeted than adding `force-dynamic`.

---

## 7. ALTERNATIVE ROOT CAUSES

### Hypothesis 1: Hydration Mismatch
**Scenario**: Server renders with `promotionsEnabled = true`, but client hydrates with `promotionsEnabled = false` (default prop value).

**Evidence**: Default prop value in `SellWizardClient` is `false` (line 65), which could override server prop if hydration fails.

**Fix**: Ensure prop is always passed from server, or remove default value.

### Hypothesis 2: Prop Not Passed to ReviewStep
**Scenario**: `promotionsEnabled` prop is lost between `SellWizardClient` and `ReviewStep`.

**Evidence**: Prop is passed correctly in code (line 1215), but runtime behavior might differ.

**Fix**: Add prop validation or ensure prop is always defined.

### Hypothesis 3: Environment Variable Not Set
**Scenario**: `PROMOTIONS_ENABLED` env var is not set or is `undefined` on the server.

**Evidence**: `process.env.PROMOTIONS_ENABLED === 'true'` would be `false` if env var is missing.

**Fix**: Verify env var is set in deployment environment.

### Hypothesis 4: Client-Side State Override
**Scenario**: Some client-side logic is overriding the `promotionsEnabled` prop.

**Evidence**: No evidence found in code, but client state could interfere.

**Fix**: Ensure prop is not modified after initial render.

---

## 8. RECOMMENDATIONS

### Immediate Actions

1. **Remove `force-dynamic`** (redundant, page already dynamic)
2. **Add runtime debugging** (use existing debug logs to trace prop flow)
3. **Verify environment variable** (confirm `PROMOTIONS_ENABLED` is set in production)
4. **Check hydration warnings** (browser console for React hydration errors)

### Diagnostic Steps

1. Enable `NEXT_PUBLIC_DEBUG=true` in production
2. Reproduce the issue after OAuth redirect
3. Check server logs for `[SELL_NEW_PAGE] Rendering with flags`
4. Check client logs for `[SELL_WIZARD] Rendering ReviewStep`
5. Check client logs for `[REVIEW_STEP] Promotion section render check`
6. Compare values across all three log points

### Minimal Fix (If Needed)

If prop passing is the issue:
```typescript
// In SellWizardClient.tsx, ensure prop is always defined
const promotionsEnabledProp = promotionsEnabled ?? false

// In ReviewStep, add explicit check
{promotionsEnabledProp && (
  <div>...</div>
)}
```

---

## CONCLUSION

**Root Cause**: **UNKNOWN** (requires runtime debugging)

**Caching Hypothesis**: **FALSE** (page was already dynamic)

**`force-dynamic` Fix**: **UNNECESSARY** (redundant, doesn't address root cause)

**Most Likely Issue**: **Prop passing bug or hydration mismatch** (client receives different value than server computed)

**Next Steps**: 
1. Remove `force-dynamic` (it's redundant)
2. Use debug logs to trace prop flow at runtime
3. Verify environment variable is set correctly
4. Check for React hydration warnings in browser console

**Smallest Theoretically Correct Fix**: 
- If env var issue: Set `PROMOTIONS_ENABLED` correctly
- If prop passing: Ensure prop is passed correctly and not overridden
- If hydration: Fix hydration mismatch
- **NOT** `force-dynamic` (already dynamic)
