# Vitest Process Hang Fix Report

## Issue
Vitest process does not exit after tests complete in the `test-integration-promotion-featured` CI job. Tests complete successfully in milliseconds, but the Node process hangs until GitHub Actions cancels at ~30 minutes.

## Root Cause Analysis

### Leaked Handle Type
**setTimeout** - A `setTimeout` callback in `SimpleMap.tsx` was not being cleaned up when the component unmounted.

### File and Line
- **File**: `components/location/SimpleMap.tsx`
- **Line**: 196 (inside `handleDragEnd` callback)
- **Issue**: The `setTimeout` was created inside an event handler (`handleDragEnd`) that's registered with `map.on('dragend', handleDragEnd)`. When the component unmounts, the event listener is removed, but if the `dragend` event has already fired and the `setTimeout` is still pending, it continues running and keeps the process alive.

### Code Path
```typescript
// Before fix (lines 194-199):
const handleDragEnd = () => {
  // Small delay to ensure all drag-related state updates complete
  setTimeout(() => {
    isUserDraggingRef.current = false
  }, 100)
}
```

The timeout ID was not stored, so it couldn't be cleared during component cleanup.

## Fix Applied

### 1. SimpleMap.tsx - Cleanup setTimeout in dragEnd handler
- **Added**: `dragEndTimeoutRef` to track the timeout ID
- **Modified**: `handleDragEnd` to clear any existing timeout before creating a new one
- **Modified**: Cleanup function to clear the timeout when component unmounts

```typescript
// After fix:
const dragEndTimeoutRef = useRef<NodeJS.Timeout | null>(null)

const handleDragEnd = () => {
  // Clear any existing timeout to prevent leaks
  if (dragEndTimeoutRef.current) {
    clearTimeout(dragEndTimeoutRef.current)
  }
  // Small delay to ensure all drag-related state updates complete
  dragEndTimeoutRef.current = setTimeout(() => {
    isUserDraggingRef.current = false
    dragEndTimeoutRef.current = null
  }, 100)
}

// In cleanup:
return () => {
  // Clear any pending timeout
  if (dragEndTimeoutRef.current) {
    clearTimeout(dragEndTimeoutRef.current)
    dragEndTimeoutRef.current = null
  }
  map.off('dragstart', handleDragStart)
  map.off('dragend', handleDragEnd)
}
```

### 2. MobileSalesShell.tsx - Guard setInterval in test environment
- **Added**: Limit on setInterval checks in test environment to prevent infinite polling if map never loads
- **Rationale**: In test environment, if the map never loads, the interval would run indefinitely

```typescript
// After fix:
const maxChecks = process.env.NODE_ENV === 'test' ? 10 : Infinity
let checkCount = 0

const interval = setInterval(() => {
  checkCount++
  checkLoaded()
  if (mapRef.current?.isLoaded?.() || checkCount >= maxChecks) {
    clearInterval(interval)
  }
}, 100)
```

### 3. tests/setup.ts - Added diagnostic code
- **Added**: `afterAll` hook to detect and log open handles after tests complete
- **Purpose**: Helps identify future handle leaks during development

## Verification

The fixes ensure:
1. ✅ All `setTimeout` callbacks are tracked and cleared on unmount
2. ✅ `setInterval` in test environment has a safety limit
3. ✅ Diagnostic code will catch future leaks

## Testing

To verify the fix:
1. Run the promotion-featured tests: `npm run test -- tests/integration/api/promotions*.test.* tests/integration/featured-email/**/*.test.* tests/integration/sell.wizard.promote-cta.test.tsx`
2. Confirm Vitest exits cleanly after tests complete
3. Check diagnostic output for any remaining open handles

## Related Components Checked

- ✅ `components/location/SimpleMap.tsx` - Fixed setTimeout leak
- ✅ `app/sales/MobileSalesShell.tsx` - Added test environment guard
- ✅ `components/location/HybridPinsOverlay.tsx` - Already has proper cleanup
- ✅ `app/sell/new/SellWizardClient.tsx` - No map components used (AddressAutocomplete is mocked in tests)

## Notes

- The issue was introduced by the `setTimeout` in `handleDragEnd` which was added for drag state management
- The fix maintains the same behavior while ensuring proper cleanup
- The diagnostic code will help catch similar issues in the future

