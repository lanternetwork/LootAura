import { NextResponse } from 'next/server'
import { sanitizeErrorDetails } from '@/lib/errors/sanitize'

export const ok = (data: any = {}) => NextResponse.json({ ok: true, ...data }, { status: 200 })

/**
 * Create a failure response with sanitized error details
 * In production, details are stripped to prevent leaking sensitive information
 */
export const fail = (status: number, code: string, error?: string, details?: any) => {
  const sanitizedDetails = sanitizeErrorDetails(details)
  return NextResponse.json(
    { 
      ok: false, 
      code, 
      error: error || 'An error occurred',
      ...(sanitizedDetails && { details: sanitizedDetails })
    }, 
    { status }
  )
}

