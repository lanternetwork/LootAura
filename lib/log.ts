/**
 * Logger utility with Sentry integration
 * Used for consistent logging across the application
 * 
 * PII-SAFE LOGGING CONVENTIONS:
 * - Do NOT log: raw emails, full names, tokens/JWTs, raw request bodies from auth endpoints
 * - Do NOT log: full user IDs in clear text (use short prefix or hash if needed for correlation)
 * - Do log: component, operation, error codes, counts, boolean flags, route paths
 * - When logging user context: prefer anonymized identifiers (e.g., "user:abc123..." instead of full UUID)
 * - When logging errors: use sanitizeErrorMessage() for user-facing messages
 * 
 * Examples:
 * ✅ logger.info('User authenticated', { component: 'auth', operation: 'signin', hasUser: true })
 * ❌ logger.info('User authenticated', { component: 'auth', operation: 'signin', email: user.email })
 */

import * as Sentry from '@sentry/nextjs'

export interface LogContext {
  component?: string
  operation?: string
  userId?: string  // Use with caution - prefer anonymized/shortened IDs
  saleId?: string   // Use with caution - prefer anonymized/shortened IDs
  requestId?: string  // Correlation/operation ID for request tracing
  opId?: string  // Alternative name for operation ID (alias for requestId)
  [key: string]: any
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production'
  private isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true'
  private isTest = process.env.NODE_ENV === 'test'

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const parts = [`[${timestamp}]`, `[${level}]`]
    
    // Include correlation/operation ID early for request tracing
    const opId = context?.requestId || context?.opId
    if (opId) parts.push(`[op:${opId}]`)
    
    if (context?.component) parts.push(`[${context.component}]`)
    if (context?.operation) parts.push(`[${context.operation}]`)
    if (context?.userId) parts.push(`[user:${context.userId}]`)
    if (context?.saleId) parts.push(`[sale:${context.saleId}]`)
    
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `${parts.join(' ')} ${message}${contextStr}`
  }

  info(message: string, context?: LogContext): void {
    // Suppress console output in test mode to avoid test framework console interception
    if (!this.isTest && (!this.isProduction || this.isDebug)) {
      console.log(this.formatMessage('INFO', message, context))
    }
  }

  warn(message: string, context?: LogContext): void {
    // Suppress console output in test mode to avoid test framework console interception
    if (!this.isTest && (!this.isProduction || this.isDebug)) {
      console.warn(this.formatMessage('WARN', message, context))
    }
    
    // Send warnings to Sentry in production
    if (this.isProduction) {
      Sentry.captureMessage(message, {
        level: 'warning',
        tags: context,
      })
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    // Suppress console output in test mode to avoid test framework console interception
    // Errors are still logged in dev/prod for debugging
    if (!this.isTest) {
      const errorMessage = error ? `${message}: ${error.message}` : message
      console.error(this.formatMessage('ERROR', errorMessage, context))
    }
    
    // Send errors to Sentry in production
    if (this.isProduction && error) {
      Sentry.captureException(error, {
        tags: context,
        extra: {
          message,
        },
      })
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDebug) {
      console.debug(this.formatMessage('DEBUG', message, context))
    }
  }
}

export const logger = new Logger()

/**
 * Generate a lightweight operation ID for request correlation
 * Format: timestamp (ms) + random suffix (4 chars)
 * Example: "1704067200000-a3f2"
 */
export function generateOperationId(): string {
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 6)
  return `${timestamp}-${randomSuffix}`
}
