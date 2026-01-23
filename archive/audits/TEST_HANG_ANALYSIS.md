# Test Hang Analysis: sell.wizard.promote-cta.test.tsx

## Executive Summary

The test `tests/integration/sell.wizard.promote-cta.test.tsx` is hanging indefinitely when navigating from the ITEMS step to the REVIEW step. The hang occurs in batch 39 of the CI integration test suite and has persisted for 20+ minutes, eventually hitting the 20-minute job timeout.

## Root Cause Analysis

### Primary Issue: Async Handler Not Completing

The hang occurs in the `goToReviewStep()` helper function when clicking "Next" to navigate from ITEMS → REVIEW. Specifically:

1. **Location**: Line 94 in the test file - `fireEvent.click(screen.getByRole('button', { name: /next/i }))`
2. **Component Code**: `handleNext()` function in `SellWizardClient.tsx` (lines 635-713)
3. **Hanging Point**: The `await supabase.auth.getUser()` calls on lines 665 and 692

### Technical Details

#### The Navigation Flow

When clicking "Next" on the ITEMS step:
1. `fireEvent.click()` triggers the button's `onClick` handler
2. `handleNext()` is called (async function)
3. `handleNext()` executes the ITEMS → REVIEW navigation logic:
   - Line 665: `await supabase.auth.getUser()` - Auth gate check
   - Line 692: `await supabase.auth.getUser()` - Server save check
   - Line 705: `setCurrentStep(currentStep + 1)` - Should advance to REVIEW

#### The Problem

**`fireEvent.click()` is synchronous** and does NOT wait for async event handlers to complete. The test immediately proceeds to `waitFor()` on line 97, which waits for "Review Your Sale" text to appear.

However, if `handleNext()` never completes (because `await supabase.auth.getUser()` hangs), then:
- `setCurrentStep()` is never called
- The REVIEW step never renders
- `waitFor()` waits indefinitely for text that never appears
- The test hangs until timeout

### Why `supabase.auth.getUser()` Might Hang

#### Mock Setup Analysis

The Supabase client is mocked in `tests/setup.ts` (lines 108-134):

```javascript
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      // ...
    },
  }),
}))
```

#### Potential Issues

1. **Mock Instance Creation**: `createSupabaseBrowserClient()` is called in the component body (line 77 of SellWizardClient.tsx), meaning it's called on every render. Each call creates a NEW mock function via the factory.

2. **`vi.clearAllMocks()` Impact**: The test's `beforeEach` calls `vi.clearAllMocks()` (line 60). While this should only clear call history and not affect `mockResolvedValue`, there may be edge cases where the mock implementation gets reset.

3. **Multiple Mock Instances**: Since the component creates a new client on each render, and React may render multiple times during navigation, there could be a race condition where:
   - One render creates mock instance A
   - Navigation triggers a re-render, creating mock instance B
   - `handleNext()` awaits on instance A's `getUser()`
   - But instance A's mock might not be properly set up

4. **Async Timing**: The mock uses `mockResolvedValue()`, which should resolve immediately. However, if there's a timing issue with how Vitest handles mocked promises in async event handlers, the promise might never resolve.

### Evidence

1. **Consistent Hang Location**: The hang always occurs at batch 39, which contains `sell.wizard.promote-cta.test.tsx`
2. **Timeout Pattern**: The test hangs for 20+ minutes until the CI job timeout (20 minutes)
3. **No Error Messages**: The test doesn't fail with an error - it simply never completes
4. **Other Batches Pass**: All other integration test batches complete successfully, indicating the issue is specific to this test file

## Proposed Solutions

### Solution 1: Fix Mock Stability (RECOMMENDED)

Ensure the Supabase mock is stable and always resolves, regardless of how many times `createSupabaseBrowserClient()` is called:

```javascript
// In tests/setup.ts
vi.mock('@/lib/supabase/client', () => {
  // Create a stable mock function that always resolves
  const stableGetUser = vi.fn().mockResolvedValue({ 
    data: { user: { id: 'test-user' } }, 
    error: null 
  })
  
  return {
    createSupabaseBrowserClient: () => ({
      auth: {
        getUser: stableGetUser, // Reuse the same mock function
        // ...
      },
    }),
  }
})
```

### Solution 2: Use `userEvent` Instead of `fireEvent`

Replace `fireEvent.click()` with `userEvent.click()` from `@testing-library/user-event`, which properly waits for async handlers:

```javascript
import userEvent from '@testing-library/user-event'

// In goToReviewStep():
await userEvent.click(screen.getByRole('button', { name: /next/i }))
```

### Solution 3: Wait for Navigation to Complete

Add an explicit wait after clicking to ensure the async handler completes:

```javascript
fireEvent.click(screen.getByRole('button', { name: /next/i }))
// Wait for navigation guard to reset and state to update
await waitFor(() => {
  // Check that we've moved to the next step
  expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument()
}, { timeout: 5000 })
```

### Solution 4: Mock at Test Level

Override the Supabase mock specifically in this test to ensure it always resolves:

```javascript
// In sell.wizard.promote-cta.test.tsx
beforeEach(() => {
  vi.clearAllMocks()
  // Ensure Supabase mock always resolves
  const mockGetUser = vi.fn().mockResolvedValue({ 
    data: { user: { id: 'test-user' } }, 
    error: null 
  })
  vi.mocked(createSupabaseBrowserClient).mockReturnValue({
    auth: {
      getUser: mockGetUser,
      // ... other methods
    },
  })
})
```

## Recommended Fix

**Combine Solution 1 and Solution 2**:
1. Make the Supabase mock stable in `tests/setup.ts`
2. Replace `fireEvent.click()` with `userEvent.click()` in the test

This addresses both the mock stability issue and the async handler waiting problem.

## Impact

- **Current**: Test hangs indefinitely, causing CI job to timeout after 20 minutes
- **After Fix**: Test should complete within the 10-second Vitest timeout
- **Risk**: Low - changes are isolated to test infrastructure and don't affect production code

## Next Steps

1. Implement Solution 1 (stable mock) in `tests/setup.ts`
2. Implement Solution 2 (userEvent) in `sell.wizard.promote-cta.test.tsx`
3. Verify the test completes successfully
4. Monitor CI to ensure no regressions




