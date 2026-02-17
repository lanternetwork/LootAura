/**
 * Unit tests for Sell Wizard error mapping helper
 * Tests toUserFacingSubmitError logic for various error codes
 */

import { describe, it, expect } from 'vitest'

/**
 * Extracted error mapping logic for testing
 * This mirrors the logic in app/sell/new/SellWizardClient.tsx toUserFacingSubmitError
 */
function toUserFacingSubmitError({ error, code, details }: { error?: string; code?: string; details?: string }): string {
  if (code === 'account_locked' || error === 'account_locked') {
    return 'This account has been locked. Please contact support if you believe this is an error.'
  }
  if (error === 'rate_limited' || code === 'RATE_LIMITED') {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (code === 'PERMISSION_DENIED') {
    return 'We couldn\'t publish this sale due to a permission issue. Please refresh and try again.'
  }
  return error || details || 'An unexpected error occurred. Please try again.'
}

describe('toUserFacingSubmitError', () => {
  it('maps account_locked code to friendly message', () => {
    const result = toUserFacingSubmitError({ code: 'account_locked' })
    expect(result).toBe('This account has been locked. Please contact support if you believe this is an error.')
  })

  it('maps account_locked error string to friendly message', () => {
    const result = toUserFacingSubmitError({ error: 'account_locked' })
    expect(result).toBe('This account has been locked. Please contact support if you believe this is an error.')
  })

  it('maps rate_limited error to friendly message', () => {
    const result = toUserFacingSubmitError({ error: 'rate_limited' })
    expect(result).toBe('Too many attempts. Please wait a moment and try again.')
  })

  it('maps RATE_LIMITED code to friendly message', () => {
    const result = toUserFacingSubmitError({ code: 'RATE_LIMITED' })
    expect(result).toBe('Too many attempts. Please wait a moment and try again.')
  })

  it('maps PERMISSION_DENIED code to friendly message', () => {
    const result = toUserFacingSubmitError({ code: 'PERMISSION_DENIED' })
    expect(result).toBe('We couldn\'t publish this sale due to a permission issue. Please refresh and try again.')
  })

  it('returns error string if provided and no special mapping', () => {
    const result = toUserFacingSubmitError({ error: 'Some custom error' })
    expect(result).toBe('Some custom error')
  })

  it('returns details if error is not provided', () => {
    const result = toUserFacingSubmitError({ details: 'Some details' })
    expect(result).toBe('Some details')
  })

  it('returns fallback message if nothing provided', () => {
    const result = toUserFacingSubmitError({})
    expect(result).toBe('An unexpected error occurred. Please try again.')
  })

  it('prioritizes code over error for account_locked', () => {
    const result = toUserFacingSubmitError({ code: 'account_locked', error: 'Some other error' })
    expect(result).toBe('This account has been locked. Please contact support if you believe this is an error.')
  })

  it('prioritizes rate_limited error over generic error', () => {
    const result = toUserFacingSubmitError({ error: 'rate_limited', details: 'Some details' })
    expect(result).toBe('Too many attempts. Please wait a moment and try again.')
  })

  it('prioritizes PERMISSION_DENIED code over error', () => {
    const result = toUserFacingSubmitError({ code: 'PERMISSION_DENIED', error: 'Some other error' })
    expect(result).toBe('We couldn\'t publish this sale due to a permission issue. Please refresh and try again.')
  })
})
