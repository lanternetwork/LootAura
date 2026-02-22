/**
 * CSRF route configuration
 * Defines which routes require CSRF protection and which are exempt
 */

/**
 * Routes that require CSRF protection
 * These are user-initiated mutations that should be protected
 */
export const CSRF_PROTECTED_ROUTES = [
  '/api/sales', // POST
  '/api/profile', // PUT/POST
  '/api/profile/update', // POST
  '/api/profile/avatar', // POST
  '/api/profile/social-links', // POST
  '/api/profile/notifications', // PUT
  '/api/seller/rating', // POST
  '/api/seller-settings', // POST/PUT
  '/api/drafts', // POST/DELETE
  '/api/drafts/publish', // POST
  '/api/sales/[id]/archive', // POST
  '/api/sales/[id]/delete', // DELETE
  '/api/sales/[id]/favorite', // POST
  '/api/favorites', // POST/DELETE
  '/api/items', // POST/PUT/DELETE
  '/api/items_v2', // POST/PUT/DELETE
  '/api/v2/profiles', // POST
  '/api/preferences', // PUT
  '/api/analytics/track', // POST (user-initiated)
] as const

/**
 * Routes that are exempt from CSRF (external callbacks, webhooks, etc.)
 * These routes handle their own authentication/verification
 */
export const CSRF_EXEMPT_ROUTES = [
  '/api/auth/', // All auth routes (OAuth callbacks, etc.)
  '/api/auth/callback', // OAuth callback
  '/api/auth/signin', // Supabase handles auth
  '/api/auth/signup', // Supabase handles auth
  '/api/auth/signout', // Supabase handles auth
  '/api/auth/logout', // Supabase handles auth
  '/api/auth/magic-link', // Supabase handles auth
  '/api/auth/reset-password', // Supabase handles auth
  '/api/auth/update-password', // Supabase handles auth
  '/api/auth/resend', // Supabase handles auth
  '/api/webhooks/stripe', // Stripe webhook (uses signature verification)
  '/api/webhooks/resend', // Resend webhook (uses signature verification)
] as const

/**
 * Check if a route requires CSRF protection
 * @param pathname - The request pathname
 * @param method - The HTTP method
 * @returns true if CSRF protection is required
 */
export function requiresCsrf(pathname: string, method: string): boolean {
  // GET requests don't need CSRF
  if (method === 'GET') {
    return false
  }

  // Check if route is exempt
  if (CSRF_EXEMPT_ROUTES.some(exempt => pathname.startsWith(exempt))) {
    return false
  }

  // Check if route requires CSRF
  return CSRF_PROTECTED_ROUTES.some(protectedRoute => {
    // Handle dynamic routes like /api/sales/[id]/archive
    const protectedPattern = protectedRoute.replace('[id]', '[^/]+')
    const regex = new RegExp(`^${protectedPattern}$`)
    return regex.test(pathname) || pathname.startsWith(protectedRoute)
  })
}

