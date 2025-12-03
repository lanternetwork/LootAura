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
  [key: string]: any
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production'
  private isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true'

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const parts = [`[${timestamp}]`, `[${level}]`]
    
    if (context?.component) parts.push(`[${context.component}]`)
    if (context?.operation) parts.push(`[${context.operation}]`)
    if (context?.userId) parts.push(`[user:${context.userId}]`)
    if (context?.saleId) parts.push(`[sale:${context.saleId}]`)
    
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `${parts.join(' ')} ${message}${contextStr}`
  }

  info(message: string, context?: LogContext): void {
    if (!this.isProduction || this.isDebug) {
      console.log(this.formatMessage('INFO', message, context))
    }
  }

  warn(message: string, context?: LogContext): void {
    if (!this.isProduction || this.isDebug) {
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
    // Always log errors
    const errorMessage = error ? `${message}: ${error.message}` : message
    console.error(this.formatMessage('ERROR', errorMessage, context))
    
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
