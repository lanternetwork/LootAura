/**
 * Rate Limiting Key Derivation
 * 
 * Derives rate limiting keys based on request context and policy scope.
 * Trusts x-forwarded-for/x-real-ip headers; falls back to request.ip if available.
 * Includes HTTP method and pathname to prevent cross-endpoint collisions.
 */

export async function deriveKey(
  req: Request, 
  scope: 'ip' | 'user' | 'ip-auth', 
  userId?: string
): Promise<string> {
  // Extract method and pathname from request
  const method = req.method || 'GET'
  let pathname = '/'
  
  // Handle NextRequest (has nextUrl) or regular Request (parse URL)
  if ('nextUrl' in req && req.nextUrl) {
    pathname = req.nextUrl.pathname
  } else {
    try {
      const url = new URL(req.url)
      pathname = url.pathname
    } catch {
      // Fallback if URL parsing fails
      pathname = '/'
    }
  }
  
  // For auth routes, always use IP even if user is available
  if (scope === 'ip-auth' || scope === 'ip') {
    const ip = getClientIp(req)
    return `ip:${ip}:${method}:${pathname}`
  }
  
  // For user-scoped policies, prefer userId if available
  if (scope === 'user' && userId) {
    return `user:${userId}:${method}:${pathname}`
  }
  
  // Fallback to IP for user-scoped policies when no userId
  const ip = getClientIp(req)
  return `ip:${ip}:${method}:${pathname}`
}

function getClientIp(req: Request): string {
  // Trust proxy headers in order of preference
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take first IP from comma-separated list
    return forwardedFor.split(',')[0].trim()
  }
  
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  
  // Fallback to connection IP (may not be available in serverless)
  const connectionIp = req.headers.get('cf-connecting-ip') || 
                      req.headers.get('x-client-ip') ||
                      'unknown'
  
  return connectionIp.trim()
}
