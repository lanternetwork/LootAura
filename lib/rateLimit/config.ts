/**
 * Rate Limiting Configuration
 * 
 * Controls when rate limiting is enabled based on environment and flags.
 * Preview deployments should not rate-limit unless explicitly enabled.
 */

export function isRateLimitingEnabled(): boolean {
  // Only enable in production with explicit flag
  return process.env.NODE_ENV === 'production' && 
         process.env.RATE_LIMITING_ENABLED === 'true'
}

export function isPreviewEnv(): boolean {
  // Check for common preview deployment indicators
  return !!(
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG === 'true'
  )
}

export function shouldBypassRateLimit(): boolean {
  // Bypass if not enabled, or if in preview env without explicit enable
  return !isRateLimitingEnabled() || 
         (isPreviewEnv() && process.env.RATE_LIMITING_ENABLED !== 'true')
}
