/**
 * Error sanitization utilities for user-facing messages
 * Ensures no sensitive information (stack traces, PostgREST codes, etc.) leaks to users
 */

/**
 * Sanitize an error message for display to end users
 * Removes technical details like PostgREST codes, SQL errors, stack traces
 */
export function sanitizeErrorMessage(error: unknown, defaultMessage: string): string {
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    // In debug mode, log the full error for developers
    if (error instanceof Error) {
      console.error('[ERROR] Full error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    } else {
      console.error('[ERROR] Full error details:', error)
    }
  }

  // If it's not an Error object, return default
  if (!(error instanceof Error)) {
    return defaultMessage
  }

  const message = error.message

  // Remove PostgREST error codes (e.g., PGRST205, PGRST116)
  if (/PGRST\d+/.test(message)) {
    return defaultMessage
  }

  // Remove SQL error patterns
  if (/SQLSTATE|syntax error|relation.*does not exist|column.*does not exist/i.test(message)) {
    return defaultMessage
  }

  // Remove stack trace indicators
  if (message.includes('at ') && message.includes('(') && message.includes(')')) {
    return defaultMessage
  }

  // If message contains internal schema/table names, sanitize
  if (/public\.|lootaura_v2\.|schema|table|column/i.test(message)) {
    return defaultMessage
  }

  // For known safe error messages, return as-is (but truncated)
  // Otherwise return default
  const safeMessage = message.length > 200 ? message.substring(0, 197) + '...' : message
  return safeMessage || defaultMessage
}

/**
 * Sanitize error details for API responses
 * Only includes safe details in production
 */
export function sanitizeErrorDetails(details: any): any {
  if (process.env.NODE_ENV === 'production') {
    // In production, strip out any potentially sensitive details
    if (typeof details === 'object' && details !== null) {
      const sanitized: any = {}
      // Only include safe fields
      if ('code' in details && typeof details.code === 'string' && !details.code.includes('PGRST')) {
        sanitized.code = details.code
      }
      return Object.keys(sanitized).length > 0 ? sanitized : undefined
    }
    return undefined
  }
  // In development, return details as-is
  return details
}

