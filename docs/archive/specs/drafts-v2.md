# Draft System v2 — Invariants Specification

## Overview

This document defines the core invariants for the Loot Aura draft system. These invariants ensure draft correctness, prevent invalid states, and make publish and promotion flows predictable and reliable.

**Status**: Specification document. These invariants represent the target architecture for the draft system.

---

## Why This Exists

This specification addresses critical bugs and design flaws in the current draft system:

### Bugs Prevented

1. **Draft Save Failures (400 Validation Errors)**
   - **Problem**: Drafts could be saved with `undefined` fields (e.g., `photos: undefined`, `items: undefined`), causing Zod validation to fail
   - **Prevented by**: I1 (drafts never empty) ensures minimum viable data exists before draft creation

2. **Stripe Errors from Invalid Listing Data**
   - **Problem**: Promotion checkout could fail due to invalid or incomplete listing data, causing confusing Stripe errors
   - **Prevented by**: I4 (publish is a gate) and I5 (promotion requires publishability) ensure only valid, publishable sales enter payment flows

3. **Last-Second Validation Failures**
   - **Problem**: Users could reach the Review step and click "Publish" only to discover validation errors, causing frustration
   - **Prevented by**: I3 (validation at step boundaries) ensures errors are caught early, before users reach publish

4. **Dashboard vs Wizard Inconsistency**
   - **Problem**: Dashboard could show "Publish" button for drafts that weren't actually publishable, or wizard could allow promotion on invalid drafts
   - **Prevented by**: I6 (server owns publishability) ensures both dashboard and wizard use the same source of truth

5. **Unnecessary Draft Saves**
   - **Problem**: Drafts were saved on mount, resume, auth refresh, and other non-meaningful events, causing performance issues and race conditions
   - **Prevented by**: I2 (drafts update only on meaningful change) reduces saves to only when actual data changes

6. **Promotion Bypass**
   - **Problem**: Users could enable promotion but publish without payment, or promotion could be toggled on invalid drafts
   - **Prevented by**: I5 (promotion requires publishability) ensures promotion is only available for valid, publishable sales

---

## Core Invariants

### I1. Drafts are never empty

**Statement**: A draft must not exist unless category and location (address + lat/lng) are present.

**Details**:
- Draft creation is **deferred** until minimum viable data exists
- Minimum viable data includes:
  - Category (required)
  - Address (required, validated)
  - City (required)
  - State (required)
  - Latitude (required, from address validation)
  - Longitude (required, from address validation)
- Drafts cannot be created on:
  - First keystroke
  - Page load
  - Before address validation completes
- A draft that exists is guaranteed to have these fields

**Rationale**: Prevents validation errors from undefined or missing required fields. Ensures drafts always represent a valid, though potentially incomplete, sale.

---

### I2. Drafts update only on meaningful change

**Statement**: Drafts update only when a normalized value changes after step-level validation.

**Details**:
- **Meaningful change** = normalized value changes after step-level validation passes
- Draft updates occur when:
  - A field changes from valid → different valid value
  - A step completes successfully
  - User explicitly saves progress
- Draft updates do **not** occur:
  - During validation failures
  - During render cycles
  - During resume hydration (unless data actually changed)
  - When `value === previous value` (after normalization)
  - On mount, auth refresh, or other lifecycle events
- Normalization rules:
  - Strings are trimmed
  - Arrays are deduplicated
  - Dates are normalized to ISO format
  - Numbers are validated and coerced

**Rationale**: Prevents unnecessary database writes, reduces race conditions, and improves performance. Ensures draft state accurately reflects user intent.

---

### I3. Validation happens at step boundaries

**Statement**: Users cannot advance steps with invalid data. Publish never discovers new validation errors.

**Details**:
- Each step owns its validation logic
- Validation occurs:
  - Before allowing step progression
  - When user attempts to proceed to next step
  - Client-side for immediate feedback
  - Server-side for security (on draft save)
- Users cannot proceed with invalid step data
- Publish step (Review) has **zero validation logic**
- Publish either:
  - Succeeds (draft is publishable)
  - Redirects to checkout (promotion enabled)
  - Returns a system error (not a validation error)

**Rationale**: Prevents last-second validation failures that frustrate users. Makes publish predictable and reliable. Separates validation concerns from publish concerns.

---

### I4. Publish is a gate, not a validator

**Statement**: Publish only checks `publishability.isPublishable`. It does not perform validation.

**Details**:
- Publish endpoint receives draft ID/key
- Server checks `draft.publishability.isPublishable`
- If `true`:
  - Non-promoted: Creates sale immediately
  - Promoted: Creates Stripe checkout, returns checkout URL
- If `false`:
  - Returns error (draft not publishable)
  - Does not return field-level validation errors
- Publish never:
  - Validates individual fields
  - Returns validation error messages
  - Corrects or normalizes data
  - Discovers new errors

**Rationale**: Makes publish predictable. If a draft reaches publish, it's already valid. Prevents Stripe errors caused by invalid listing data.

---

### I5. Promotion requires publishability

**Statement**: Promotion cannot be enabled unless `publishability.isPublishable === true`.

**Details**:
- Promotion toggle/checkbox is **disabled** until `isPublishable === true`
- Promotion UI is hidden or disabled when:
  - Draft is incomplete
  - Draft has validation errors
  - `publishability.isPublishable === false`
- Promotion can only be toggled when:
  - All required fields are present and valid
  - Draft passes all publishability checks
  - `publishability.isPublishable === true`
- Promotion is a **post-validation enhancement**
- Promotion never:
  - Validates listing data
  - Corrects listing errors
  - Bypasses publishability checks

**Rationale**: Prevents promotion on invalid drafts. Ensures payment flows only receive valid, publishable sales. Makes promotion a simple payment gate, not a validation system.

---

### I6. Server owns publishability

**Statement**: Dashboard and wizard both rely on server-computed `publishability`.

**Details**:
- `publishability` is computed **server-side**, not inferred client-side
- `publishability` includes:
  - `isPublishable: boolean` (computed from draft data)
  - `blockingErrors: FieldError[]` (if not publishable, why)
- Both dashboard and wizard:
  - Fetch `publishability` from server
  - Render UI based on server response
  - Do not compute publishability client-side
- Dashboard buttons (Publish, Promote) are rendered based on server-computed `isPublishable`
- Wizard promotion toggle is enabled/disabled based on server-computed `isPublishable`

**Rationale**: Prevents client/server mismatches. Ensures dashboard and wizard always agree on publishability. Makes system behavior predictable and testable.

---

## Implementation Notes

### Publishability Computation

The `publishability` field should be computed by:

1. Checking all required fields are present and valid
2. Validating field-level rules (e.g., date ranges, image URLs)
3. Checking business rules (e.g., minimum photos, valid location)
4. Returning structured result:
   ```typescript
   {
     isPublishable: boolean
     blockingErrors: Array<{
       field: string
       message: string
     }>
   }
   ```

### Draft Schema (Conceptual)

```typescript
Draft {
  id: string
  owner_id: string
  
  data: {
    category: string
    address: string
    city: string
    state: string
    zip?: string
    lat: number
    lng: number
    
    dates?: { ... }
    photos?: string[]
    items?: Item[]
    description?: string
  }
  
  progress: {
    completedSteps: Step[]
    currentStep: Step
  }
  
  publishability: {
    isPublishable: boolean
    blockingErrors: FieldError[]
    computedAt: timestamp
  }
  
  timestamps: { ... }
}
```

---

## Related Documents

- [Environment Variables](env.md)
- [Operations Runbook](runbook.md)

---

**Last Updated**: 2025-01-12  
**Status**: Specification (not yet implemented)
