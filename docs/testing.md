# Testing Guide

**Last updated: 2025-01-27 — Map-Centric Architecture**

This guide covers testing strategies, requirements, and best practices for LootAura's map-centric architecture.

## Map-Centric Testing Strategy

### Core Testing Principles

1. **Single Fetch Path**: Test only 2 entry points to `fetchMapSales`
2. **Distance-to-Zoom**: Test distance slider controls map zoom
3. **Viewport Synchronization**: Test map and list stay synchronized
4. **Performance**: Test debouncing and bounds change detection

### Supabase Mocking

**Important**: Tests that interact with Supabase (e.g., sales-viewport tests) **must** use the shared Supabase mock helpers, not ad-hoc mocks.

#### Shared Mock Helpers

- **`tests/utils/mocks/supabaseServerMock.ts`**: Main Supabase server mock
- **`tests/utils/mocks/makeSupabaseQueryChain.ts`**: Query chain builder
- **`tests/mocks/supabaseServer.mock.ts`**: Alternative mock implementation

#### Usage Example

```typescript
// ✅ DO: Use shared mock helper
import { createSupabaseServerClientMock } from '@/tests/utils/mocks/supabaseServerMock'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock({
    // Configure mock behavior
  })
}))

// ❌ DON'T: Create ad-hoc inline mocks
vi.mock('@/lib/supabase/server', () => {
  // Ad-hoc mock implementation
  return {
    createSupabaseServerClient: () => ({
      from: () => ({
        select: () => ({
          // Inline mock chain...
        })
      })
    })
  }
})
```

#### Why Use Shared Mocks

- **Consistency**: All tests use the same mock structure
- **Maintainability**: Changes to Supabase API only need updates in one place
- **Reliability**: Shared mocks are tested and verified to work correctly
- **Documentation**: Shared mocks serve as documentation for Supabase usage patterns

### Test Categories

#### Unit Tests
- **Distance-to-Zoom Mapping**: Test `distanceToZoom()` function
- **Single Fetch Path**: Test only 2 entry points exist
- **Viewport Calculations**: Test bounds and zoom calculations
- **Filter Logic**: Test category and date filtering

#### Integration Tests
- **Map-List Sync**: Test map viewport changes update list
- **Filter Integration**: Test filter changes trigger correct API calls
- **ZIP Search**: Test ZIP search updates both map and list
- **Performance**: Test debouncing and request cancellation

#### E2E Tests
- **Complete User Flows**: Test end-to-end user interactions
- **Mobile Responsiveness**: Test mobile-specific interactions
- **Performance Under Load**: Test with large datasets
- **Cross-Browser**: Test across different browsers

## Console Guardrail System

### Overview
The console guardrail system automatically fails tests when unexpected `console.error` or `console.warn` messages are detected. This ensures test hygiene and prevents console noise from reaching production.

### How It Works
- **Detection**: Intercepts all `console.error` and `console.warn` calls
- **Allowlist**: Only allows pre-approved message patterns
- **Failure**: Tests fail immediately on unexpected console output
- **Documentation**: Each allowed pattern is documented with its source

### Adding Temporary Allowances

#### For New Test Development
```typescript
// In your test file, add a temporary allowance with expiry
describe('My New Feature', () => {
  // TODO: Remove this allowance by 2025-11-01
  // Reason: Testing new error handling that logs expected errors
  const originalConsoleError = console.error
  console.error = (...args) => {
    if (args[0]?.includes('Expected error during testing')) {
      // Allow this specific message
      return
    }
    originalConsoleError(...args)
  }
  
  afterEach(() => {
    console.error = originalConsoleError
  })
  
  // Your tests here...
})
```

#### For Debugging Existing Issues
```typescript
// Temporarily allow specific patterns during debugging
const DEBUG_ALLOWANCES = [
  /^Debug: /, // Allow debug messages
  /^Warning: /, // Allow warning messages
]

// Add to ALLOWED_PATTERNS temporarily
// Remember to remove after debugging!
```

### Permanent Allowance Process

#### 1. Identify the Source
- **Test File**: Which test is generating the console output?
- **Source Code**: Which component/function is logging?
- **Reason**: Why is this console output necessary?

#### 2. Add to Allowlist
```typescript
// In tests/setup.ts, add to ALLOWED_PATTERNS
/^Your specific pattern/, // Brief description - tests/unit/your-test.test.ts
```

#### 3. Document the Allowance
- **Pattern**: Exact regex pattern
- **Source**: Test file that generates it
- **Reason**: Why it's necessary
- **Owner**: Who added it and when

#### 4. Verify the Fix
```bash
# Run the specific test to verify
npm test tests/unit/your-test.test.ts

# Run all tests to ensure no regressions
npm test
```

### Common Allowance Patterns

#### Debug Logging
```typescript
/^\[DEBUG\]/, // Debug messages from lib/debug.ts
/^\[MAP:DEBOUNCE\]/, // Map debounce logging
/^\[CACHE\]/, // Cache operation logging
```

#### Expected Errors
```typescript
/^API error:/, // Expected API errors in tests
/^Failed to /, // Expected failure messages
/^Warning: /, // Expected warning messages
```

#### React Warnings
```typescript
/^Warning: Function components cannot be given refs/, // React forwardRef warnings
/^Warning: .*: `ref` is not a prop/, // React ref prop warnings
```

### Best Practices

#### ✅ Do
- **Document**: Always document why an allowance is needed
- **Specific**: Use specific patterns, not broad ones
- **Temporary**: Mark temporary allowances with expiry dates
- **Review**: Regularly review and clean up allowances

#### ❌ Don't
- **Broad Patterns**: Avoid overly broad regex patterns
- **Silent Failures**: Don't silently ignore console output
- **Permanent**: Don't make allowances permanent without justification
- **Ignore**: Don't ignore console guardrail failures

### Troubleshooting

#### Test Failing on Expected Console Output
1. **Check Allowlist**: Is the pattern already allowed?
2. **Verify Pattern**: Does the regex match the exact message?
3. **Check Source**: Is the console output from the expected source?
4. **Add Allowance**: Add specific pattern with documentation

#### Unexpected Console Output
1. **Identify Source**: Find which test is generating the output
2. **Check Code**: Look for console.error/warn in source code
3. **Fix Source**: Remove or fix the console output
4. **Update Test**: Ensure test doesn't rely on console output

#### Console Guardrail Not Working
1. **Check Setup**: Verify tests/setup.ts is loaded
2. **Check Order**: Ensure setup runs before tests
3. **Check Pattern**: Verify regex pattern is correct
4. **Check Logic**: Ensure isAllowedMessage logic is working

### Maintenance

#### Weekly Review
- [ ] Check for new console output patterns
- [ ] Review temporary allowances
- [ ] Clean up expired allowances
- [ ] Update documentation

#### Monthly Audit
- [ ] Review all allowances for necessity
- [ ] Check for overly broad patterns
- [ ] Verify test coverage
- [ ] Update best practices

### Examples

#### Good Allowance
```typescript
/^\[MAP:DEBOUNCE\]/, // Debug logging from debounce manager - tests/integration/map.debounce-cancel.test.ts
```
- **Specific**: Matches exact pattern
- **Documented**: Clear source and reason
- **Necessary**: Required for test functionality

#### Bad Allowance
```typescript
/^.*/, // Allow all console output
```
- **Too Broad**: Matches everything
- **Not Documented**: No source or reason
- **Unnecessary**: Defeats the purpose of the guardrail

#### Temporary Allowance
```typescript
// TODO: Remove by 2025-11-01 - tests/unit/new-feature.test.ts
/^Debug: New feature/, // Temporary allowance for new feature testing
```
- **Time-bound**: Has expiry date
- **Specific**: Matches exact pattern
- **Temporary**: Will be removed after feature is stable
