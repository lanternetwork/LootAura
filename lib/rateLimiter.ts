// Rate limiting utility for API routes
// In-memory implementation for simplicity; consider Redis for production

interface RateLimitConfig {
  limit: number
  windowMs: number
  keyGenerator: (request: Request) => string
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store (consider Redis for production)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean up every minute

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const current = rateLimitStore.get(key)
  
  if (!current || now > current.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (current.count >= limit) {
    return false
  }
  
  current.count++
  return true
}

export function getRateLimitInfo(key: string): { remaining: number; resetTime: number } | null {
  const current = rateLimitStore.get(key)
  if (!current) return null
  
  const now = Date.now()
  if (now > current.resetTime) return null
  
  return {
    remaining: Math.max(0, current.count),
    resetTime: current.resetTime
  }
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  AUTH: {
    limit: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyGenerator: (request: Request) => {
      const ip = request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown'
      return `auth:${ip}`
    }
  },
  UPLOAD_SIGNER: {
    limit: 5,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: (request: Request) => {
      const ip = request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown'
      return `upload-signer:${ip}`
    }
  }
} as const

export function createRateLimitMiddleware(config: RateLimitConfig) {
  return (request: Request): { allowed: boolean; error?: string } => {
    const key = config.keyGenerator(request)
    const allowed = checkRateLimit(key, config.limit, config.windowMs)
    
    if (!allowed) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[RATE_LIMIT] Rate limit exceeded', { 
          event: 'rate-limit', 
          key: key.split(':')[0], // Log only the type, not the IP
          limit: config.limit,
          windowMs: config.windowMs
        })
      }
      
      return {
        allowed: false,
        error: 'Too many requests. Please try again later.'
      }
    }
    
    return { allowed: true }
  }
}