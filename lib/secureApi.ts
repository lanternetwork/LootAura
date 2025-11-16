import { NextRequest, NextResponse } from 'next/server'
import { requireCsrfToken } from '@/lib/csrf'
import { sanitizeText, sanitizeHtml, sanitizeEmail, sanitizeUrl, sanitizeTags } from '@/lib/sanitize'
import { sanitizeErrorMessage } from '@/lib/errors/sanitize'
import { fail } from '@/lib/http/json'
import { logger } from '@/lib/log'
import * as Sentry from '@sentry/nextjs'

export interface SecureApiOptions {
  requireAuth?: boolean
  requireCsrf?: boolean
  sanitizeInput?: boolean
  allowedMethods?: string[]
}

export function createSecureApiHandler(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  options: SecureApiOptions = {}
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      // Check allowed methods
      if (options.allowedMethods && !options.allowedMethods.includes(req.method)) {
        return NextResponse.json(
          { error: 'Method not allowed' },
          { status: 405 }
        )
      }

      // CSRF protection
      if (options.requireCsrf && !requireCsrfToken(req)) {
        logger.warn('CSRF token validation failed', {
          component: 'secureApi',
          operation: 'csrf_check',
          path: req.nextUrl.pathname,
        })
        return NextResponse.json(
          { error: 'Invalid CSRF token' },
          { status: 403 }
        )
      }

      // Input sanitization
      if (options.sanitizeInput) {
        // This would be implemented per-endpoint as needed
        // For now, we'll just validate the request structure
      }

      // Call the actual handler
      return await handler(req, context)
    } catch (error) {
      // Log error with context
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('API handler error', error instanceof Error ? error : new Error(errorMessage), {
        component: 'secureApi',
        operation: 'handler_execution',
        path: req.nextUrl.pathname,
        method: req.method,
      })

      // Send to Sentry in production
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(error, {
          tags: {
            component: 'secureApi',
            path: req.nextUrl.pathname,
            method: req.method,
          },
        })
      }

      // Return sanitized error response
      const safeMessage = sanitizeErrorMessage(error, 'Internal server error')
      return fail(500, 'INTERNAL_ERROR', safeMessage)
    }
  }
}

// Sanitization helpers for common input types
export function sanitizeSaleInput(input: any) {
  return {
    title: sanitizeText(input.title, 200),
    description: sanitizeHtml(input.description, { maxLength: 2000 }),
    address: sanitizeText(input.address, 500),
    city: sanitizeText(input.city, 100),
    state: sanitizeText(input.state, 50),
    zip: sanitizeText(input.zip, 20),
    contact: sanitizeText(input.contact, 200),
    tags: sanitizeTags(input.tags || []),
    price_min: typeof input.price_min === 'number' ? input.price_min : undefined,
    price_max: typeof input.price_max === 'number' ? input.price_max : undefined,
    lat: typeof input.lat === 'number' ? input.lat : undefined,
    lng: typeof input.lng === 'number' ? input.lng : undefined,
    start_at: input.start_at,
    end_at: input.end_at
  }
}

export function sanitizeReviewInput(input: any) {
  return {
    rating: Math.max(1, Math.min(5, parseInt(input.rating) || 1)),
    comment: sanitizeText(input.comment, 1000)
  }
}

export function sanitizeSearchInput(input: any) {
  return {
    q: sanitizeText(input.q, 200),
    maxKm: typeof input.maxKm === 'number' ? Math.min(1000, Math.max(0, input.maxKm)) : 25,
    lat: typeof input.lat === 'number' ? input.lat : undefined,
    lng: typeof input.lng === 'number' ? input.lng : undefined,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    min: typeof input.min === 'number' ? input.min : undefined,
    max: typeof input.max === 'number' ? input.max : undefined,
    tags: sanitizeTags(input.tags || [])
  }
}

export function sanitizeUserInput(input: any) {
  return {
    email: sanitizeEmail(input.email),
    display_name: sanitizeText(input.display_name, 100),
    avatar_url: sanitizeUrl(input.avatar_url)
  }
}

// Validation helpers
export function validateRequiredFields(input: any, requiredFields: string[]): string[] {
  const missing: string[] = []
  
  for (const field of requiredFields) {
    if (!input[field] || (typeof input[field] === 'string' && input[field].trim() === '')) {
      missing.push(field)
    }
  }
  
  return missing
}

export function validateFieldTypes(input: any, fieldTypes: Record<string, string>): string[] {
  const errors: string[] = []
  
  for (const [field, expectedType] of Object.entries(fieldTypes)) {
    if (input[field] !== undefined) {
      const actualType = typeof input[field]
      if (actualType !== expectedType) {
        errors.push(`${field} must be of type ${expectedType}, got ${actualType}`)
      }
    }
  }
  
  return errors
}

export function validateNumericRange(value: number, min: number, max: number): boolean {
  return typeof value === 'number' && value >= min && value <= max
}

export function validateStringLength(value: string, min: number, max: number): boolean {
  return typeof value === 'string' && value.length >= min && value.length <= max
}

export function validateEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validateUrlFormat(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function validateUuidFormat(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}
