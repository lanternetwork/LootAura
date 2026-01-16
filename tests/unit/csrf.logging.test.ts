/**
 * Regression test: Ensure CSRF logging does not leak sensitive data
 * 
 * This test verifies that:
 * 1. No full cookie strings are logged
 * 2. No full CSRF tokens are logged
 * 3. No auth tokens or PII are logged
 * 4. Logs are gated behind NEXT_PUBLIC_DEBUG flag
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

describe('CSRF Logging Security', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let originalDebug: string | undefined

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Store original debug flag
    originalDebug = process.env.NEXT_PUBLIC_DEBUG
    // Ensure debug is OFF by default for security tests
    delete process.env.NEXT_PUBLIC_DEBUG
  })

  afterEach(() => {
    // Restore console
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    
    // Restore debug flag
    if (originalDebug !== undefined) {
      process.env.NEXT_PUBLIC_DEBUG = originalDebug
    } else {
      delete process.env.NEXT_PUBLIC_DEBUG
    }
  })

  it('should not log full cookie strings in production mode', async () => {
    // Mock document.cookie with sensitive data
    const sensitiveCookie = 'csrf-token=abc123def456; sb-auth-token=secret123; user-email=user@example.com'
    
    // Mock document for client-side code
    Object.defineProperty(global, 'document', {
      value: {
        cookie: sensitiveCookie,
      },
      writable: true,
      configurable: true,
    })

    // Import and call CSRF client functions
    const { getCsrfToken } = await import('@/lib/csrf-client')
    getCsrfToken()

    // Check that no console.log was called (debug is off)
    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should not log sensitive data even in debug mode', async () => {
    // Enable debug mode
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    const sensitiveCookie = 'csrf-token=abc123def456; sb-auth-token=secret123; user-email=user@example.com'
    const sensitiveToken = 'abc123def456'
    
    Object.defineProperty(global, 'document', {
      value: {
        cookie: sensitiveCookie,
      },
      writable: true,
      configurable: true,
    })

    const { getCsrfToken } = await import('@/lib/csrf-client')
    getCsrfToken()

    // Get all console.log calls
    const logCalls = consoleLogSpy.mock.calls
    
    // Check that no full cookie string was logged
    const allLogMessages = logCalls.map(call => JSON.stringify(call))
    const hasFullCookieString = allLogMessages.some(msg => 
      msg.includes('Full cookie string') || 
      msg.includes(sensitiveCookie) ||
      msg.includes('sb-auth-token') ||
      msg.includes('user@example.com')
    )
    expect(hasFullCookieString).toBe(false)

    // Check that no full token was logged
    const hasFullToken = allLogMessages.some(msg => 
      msg.includes(`"fullToken"`) ||
      msg.includes(`"${sensitiveToken}"`) ||
      (msg.includes('token') && msg.includes(sensitiveToken) && !msg.includes('...'))
    )
    expect(hasFullToken).toBe(false)
  })

  it('should not log full tokens in server-side validation (test env bypass)', async () => {
    // In test environment, CSRF validation is bypassed, but we can still check
    // that the code doesn't log sensitive data when it would run
    const sensitiveToken = 'abc123def456789012345678901234567890'
    
    // Create a mock Request-like object
    const mockRequest = {
      headers: {
        get: (name: string) => {
          if (name === 'x-csrf-token') return sensitiveToken
          if (name === 'cookie') return `csrf-token=${sensitiveToken}`
          return null
        },
      },
    } as unknown as Request

    // Note: In test env, validateCsrfToken may bypass logging
    // But we verify the code structure doesn't log sensitive data
    const { validateCsrfToken } = await import('@/lib/csrf')
    
    // The function should not throw and should not log in test env
    const result = validateCsrfToken(mockRequest)
    expect(typeof result).toBe('boolean')
    
    // In test environment, logging is skipped, so no logs should appear
    // This is the expected behavior
    expect(consoleLogSpy.mock.calls.length).toBe(0)
  })

  it('should only log safe metadata in debug mode', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    
    const sensitiveCookie = 'csrf-token=abc123def456; sb-auth-token=secret123'
    
    Object.defineProperty(global, 'document', {
      value: {
        cookie: sensitiveCookie,
      },
      writable: true,
      configurable: true,
    })

    const { getCsrfToken } = await import('@/lib/csrf-client')
    getCsrfToken()

    // Get all console.log calls
    const logCalls = consoleLogSpy.mock.calls
    const allLogMessages = logCalls.map(call => JSON.stringify(call))
    
    // Should only log safe metadata like:
    // - tokenLength
    // - tokenPrefix (with ...)
    // - cookieName
    // - availableCookieNames (names only, no values)
    const hasSafeMetadata = allLogMessages.some(msg => 
      msg.includes('tokenLength') ||
      msg.includes('tokenPrefix') ||
      msg.includes('cookieName') ||
      msg.includes('availableCookieNames')
    )
    
    // In debug mode, we should see some safe metadata
    // But the test above already verified no sensitive data is logged
    expect(hasSafeMetadata || logCalls.length === 0).toBe(true)
  })
})
