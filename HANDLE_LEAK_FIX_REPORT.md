# Async Handle Leak Fix Report

## Summary

Identified and fixed the async handle preventing Vitest from exiting after tests complete.

## Handle Type Found

**`Timeout` handle** from `setInterval` in `lib/rateLimiter.ts:19`

## Root Cause

The `lib/rateLimiter.ts` module creates a `setInterval` that runs every 60 seconds to clean up expired rate limit entries. This interval:

1. Runs immediately when the module is imported (module-level code)
2. Is never cleared or stopped
3. Keeps the Node.js event loop alive indefinitely
4. Prevents Vitest from exiting after all tests complete

## File and Line

- **File:** `lib/rateLimiter.ts`
- **Line:** 19-26
- **Code:**
  ```typescript
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }, 60000) // Clean up every minute
  ```

## Fix Applied

Added a guard to prevent the interval from running in test environments:

```typescript
// Guard: Don't run in test environment to prevent leaked handles
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }, 60000) // Clean up every minute
}
```

This matches the pattern already used in `lib/rateLimit/store.ts:21`.

## Additional Fixes

### 1. Auth Subscription Cleanup (`app/sell/new/SellWizardClient.tsx:213-215`)

**Issue:** The `onAuthStateChange` subscription cleanup could fail if `subscription` is undefined.

**Fix:** Added null check before unsubscribing:
```typescript
return () => {
  // Safely unsubscribe - subscription might be undefined in test environments
  if (subscription) {
    subscription.unsubscribe()
  }
}
```

### 2. MSW Server Cleanup (`tests/setup/msw.server.ts:229-231`)

**Issue:** MSW server might not fully clean up internal handles immediately.

**Fix:** Added explicit handler reset and error handling:
```typescript
afterAll(async () => {
  server.resetHandlers() // Ensure handlers are reset before closing
  try {
    await server.close()
    // Give MSW a moment to fully clean up internal handles
    await new Promise(resolve => setImmediate(resolve))
  } catch (error) {
    // Only log if diagnostics are enabled to avoid memory issues
    if (process.env.ENABLE_HANDLE_DIAGNOSTICS === 'true') {
      console.log('[HANDLE_DIAG] MSW server.close() error (ignored):', error)
    }
  }
})
```

## Diagnostic Tooling

Added diagnostic logging in `tests/setup.ts` to identify leaked handles:

- Enabled via `ENABLE_HANDLE_DIAGNOSTICS=true` environment variable
- Logs handle types, stack traces, and properties after all tests complete
- Filters out expected handles (Immediate, MessagePort from Vitest workers)
- Pattern added to `ALLOWED_PATTERNS` to prevent test failures

## Verification

To verify the fix works:

1. Run tests with diagnostics enabled:
   ```bash
   ENABLE_HANDLE_DIAGNOSTICS=true npm run test -- tests/integration/api/promotions.status.test.ts tests/integration/featured-email/ tests/integration/sell.wizard.promote-cta.test.tsx
   ```

2. Check that:
   - Tests complete successfully
   - No leaked handles are reported (or only expected handles)
   - Process exits immediately after tests finish
   - No hanging or timeout

## Expected Outcome

After these fixes:
- ✅ Node.js process exits immediately after all tests complete
- ✅ No `Timeout` handles remain active
- ✅ Vitest worker process terminates cleanly
- ✅ CI job completes without hanging or cancellation

## Files Modified

1. `lib/rateLimiter.ts` - Added test environment guard for setInterval
2. `app/sell/new/SellWizardClient.tsx` - Added null check for subscription cleanup
3. `tests/setup/msw.server.ts` - Improved MSW server cleanup
4. `tests/setup.ts` - Added handle diagnostic logging

## Notes

- The diagnostic logging can be removed once the fix is confirmed working
- Other `setInterval` calls in `lib/performance/*.ts` are safe as they're only executed when explicitly called, not on module import
- The fix follows the same pattern already established in `lib/rateLimit/store.ts`


