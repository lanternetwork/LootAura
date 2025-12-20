# Async Handle Leak Fix Report

## Problem
Vitest process was hanging after tests completed successfully, causing CI jobs to timeout at 30 minutes. This started after recent map/location UX changes.

## Root Causes Identified

### 1. Geolocation API Not Mocked
**Issue**: `navigator.geolocation.getCurrentPosition()` calls in `ClientGeolocation.tsx` were not globally mocked in the test environment. If these calls never resolve/reject, they can keep the Node process alive.

**Fix**: Added global mock for `navigator.geolocation` in `tests/setup.ts` that immediately rejects with `PERMISSION_DENIED` error using `setImmediate` to ensure async behavior.

**Files Changed**:
- `tests/setup.ts`: Added `navigator.geolocation` mock

### 2. Map Event Listeners Not Properly Cleaned Up
**Issue**: Map event listeners (`map.on('move', ...)`, `map.on('zoom', ...)`) in `MobileSalesShell.tsx` and `SalesClient.tsx` were added in `useEffect` hooks that depend only on `selectedPinCoords`. If the map instance changes but `selectedPinCoords` doesn't, the cleanup function might try to remove listeners from a stale map instance, leaving listeners attached to the new map instance.

**Fix**: Updated cleanup functions to:
1. Get fresh map instance from `mapRef.current` during cleanup
2. Clean up listeners from both the original map instance and the current map instance (if different)
3. Updated `updatePosition` callbacks to get fresh map instance to prevent stale references

**Files Changed**:
- `app/sales/MobileSalesShell.tsx`: Fixed map listener cleanup in pin position update effect
- `app/sales/SalesClient.tsx`: Fixed map listener cleanup in desktop pin position update effect

### 3. Enhanced Diagnostic Hook
**Issue**: The existing diagnostic hook wasn't forcing exit when handles were detected, allowing CI to hang.

**Fix**: Enhanced the diagnostic hook in `tests/setup.ts` to:
1. Use `setTimeout` with 100ms delay to allow microtasks to settle
2. Log detailed information about leaked handles (type, stack traces, timeout info)
3. Force `process.exit(1)` when handles are detected to fail fast instead of hanging

**Files Changed**:
- `tests/setup.ts`: Enhanced `afterAll` diagnostic hook

## Changes Made

### `tests/setup.ts`
1. Added global `navigator.geolocation` mock that immediately rejects in test environment
2. Enhanced diagnostic hook to force exit when handles are detected
3. Improved handle logging with stack traces and timeout information

### `app/sales/MobileSalesShell.tsx`
1. Updated `updatePosition` callback to get fresh map instance
2. Enhanced cleanup function to clean up from both original and current map instances

### `app/sales/SalesClient.tsx`
1. Updated `updatePosition` callback to get fresh map instance
2. Enhanced cleanup function to clean up from both original and current map instances

## Testing
The diagnostic hook will now:
- Detect any remaining open handles after tests complete
- Log detailed information about the handles
- Force exit with code 1 to fail CI fast instead of hanging

## Next Steps
1. Run the failing CI subset locally or in CI to verify the fix
2. Once confirmed working, the forced `process.exit(1)` can be removed (keeping the diagnostic logging)
3. Monitor CI to ensure no more timeout issues

## Expected Outcome
- CI jobs should complete in < 30 minutes
- If handles are still leaked, CI will fail fast with diagnostic information
- Process should exit cleanly after tests complete

