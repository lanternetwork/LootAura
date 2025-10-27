/**
 * Rate Limiting Headers
 * 
 * Applies standard rate limiting headers to responses.
 * Includes Retry-After on 429 responses.
 */

import { Policy } from './policies'

export function applyRateHeaders(
  res: Response,
  policy: Policy,
  remaining: number,
  resetAt: number,
  softLimited: boolean
): Response {
  const headers = new Headers(res.headers)
  
  // Standard rate limit headers
  headers.set('X-RateLimit-Limit', policy.limit.toString())
  headers.set('X-RateLimit-Remaining', remaining.toString())
  headers.set('X-RateLimit-Reset', resetAt.toString())
  headers.set('X-RateLimit-Policy', `${policy.name} ${policy.limit}/${policy.windowSec}`)
  
  // Add Retry-After on hard limits (when remaining is 0 and not soft limited)
  if (remaining === 0 && !softLimited) {
    const retryAfter = Math.max(1, resetAt - Math.floor(Date.now() / 1000))
    headers.set('Retry-After', retryAfter.toString())
  }
  
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  })
}
