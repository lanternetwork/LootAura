/**
 * Rate Limiting Key Derivation
 * 
 * Derives rate limiting keys based on request context and policy scope.
 * Trusts x-forwarded-for/x-real-ip headers; falls back to request.ip if available.
 */

export async function deriveKey(
  req: Request, 
  scope: 'ip' | 'user' | 'ip-auth', 
  userId?: string
): Promise<string> {
  // For auth routes, always use IP even if user is available
  if (scope === 'ip-auth' || scope === 'ip') {
    const ip = getClientIp(req)
    return `ip:${ip}`
  }
  
  // For user-scoped policies, prefer userId if available
  if (scope === 'user' && userId) {
    return `user:${userId}`
  }
  
  // Fallback to IP for user-scoped policies when no userId
  const ip = getClientIp(req)
  return `ip:${ip}`
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
