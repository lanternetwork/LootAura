import { isRateLimitingEnabled } from '@/lib/rateLimit/config'

export interface RateLimitStatus {
  enabled: boolean
  backend: 'upstash' | 'memory' | 'unknown'
  policies: string[]
  environment: string
}

export function getRateLimitStatus(): RateLimitStatus {
  const enabled = isRateLimitingEnabled()
  const environment = process.env.NODE_ENV || 'development'
  
  let backend: 'upstash' | 'memory' | 'unknown' = 'unknown'
  if (enabled) {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      backend = 'upstash'
    } else {
      backend = 'memory'
    }
  }
  
  const policies = [
    'AUTH_DEFAULT',
    'AUTH_HOURLY', 
    'AUTH_CALLBACK',
    'GEO_ZIP_SHORT',
    'GEO_ZIP_HOURLY',
    'SALES_VIEW_30S',
    'SALES_VIEW_HOURLY',
    'MUTATE_MINUTE',
    'MUTATE_DAILY',
    'ADMIN_TOOLS',
    'ADMIN_HOURLY'
  ]
  
  return {
    enabled,
    backend,
    policies,
    environment
  }
}

export function formatRateLimitHeaders(headers: Headers): string {
  const limit = headers.get('X-RateLimit-Limit')
  const remaining = headers.get('X-RateLimit-Remaining')
  const reset = headers.get('X-RateLimit-Reset')
  const policy = headers.get('X-RateLimit-Policy')
  const retryAfter = headers.get('Retry-After')
  
  const parts = []
  if (limit) parts.push(`Limit: ${limit}`)
  if (remaining) parts.push(`Remaining: ${remaining}`)
  if (reset) parts.push(`Reset: ${reset}`)
  if (policy) parts.push(`Policy: ${policy}`)
  if (retryAfter) parts.push(`Retry-After: ${retryAfter}s`)
  
  return parts.join(' | ')
}
