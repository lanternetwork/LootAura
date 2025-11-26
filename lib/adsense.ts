/**
 * AdSense route validation
 * 
 * Determines which routes are allowed to display Google AdSense ads.
 * This ensures compliance with Google's policy: "Google-served ads on screens 
 * without publisher-content" - ads should only appear on pages with meaningful content.
 */

/**
 * Check if a route is allowed to display AdSense ads
 * @param pathname - The pathname from usePathname() or similar
 * @returns true if ads are allowed on this route, false otherwise
 */
export function isAdsenseRoute(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false
  }

  // Normalize pathname (remove trailing slash, handle query params)
  const normalized = pathname.split('?')[0].replace(/\/$/, '') || '/'

  // ✅ ALLOW: Main sales browsing pages with content
  // /sales - main sales map/list view
  if (normalized === '/sales') {
    return true
  }

  // ✅ ALLOW: Sale detail pages (must have valid sale loaded - checked separately)
  // /sales/[id] - individual sale detail pages
  if (normalized.startsWith('/sales/') && normalized !== '/sales') {
    // Additional validation happens at component level (sale must be loaded)
    return true
  }

  // 🚫 DISALLOW: Homepage (hero/landing page)
  if (normalized === '/') {
    return false
  }

  // 🚫 DISALLOW: Auth pages
  if (
    normalized.startsWith('/auth/') ||
    normalized.startsWith('/signin') ||
    normalized.startsWith('/sign-in') ||
    normalized.startsWith('/signup') ||
    normalized.startsWith('/sign-up') ||
    normalized.startsWith('/login') ||
    normalized.startsWith('/reset-password') ||
    normalized.startsWith('/forgot-password') ||
    normalized.startsWith('/verify-email')
  ) {
    return false
  }

  // 🚫 DISALLOW: Account/settings/profile pages
  if (
    normalized.startsWith('/account/') ||
    normalized.startsWith('/settings') ||
    normalized.startsWith('/profile') ||
    normalized.startsWith('/user/')
  ) {
    return false
  }

  // 🚫 DISALLOW: Static info pages (about/privacy/terms/contact)
  if (
    normalized === '/about' ||
    normalized === '/privacy' ||
    normalized === '/terms' ||
    normalized.startsWith('/contact') ||
    normalized.startsWith('/help') ||
    normalized.startsWith('/faq')
  ) {
    return false
  }

  // 🚫 DISALLOW: Error/404/maintenance pages
  if (
    normalized === '/error' ||
    normalized === '/404' ||
    normalized === '/500' ||
    normalized === '/maintenance' ||
    normalized.startsWith('/_error')
  ) {
    return false
  }

  // 🚫 DISALLOW: Onboarding/setup wizards
  if (
    normalized.startsWith('/onboarding') ||
    normalized.startsWith('/setup') ||
    normalized.startsWith('/wizard')
  ) {
    return false
  }

  // 🚫 DISALLOW: Sell/create pages (form pages, not content-rich)
  if (normalized.startsWith('/sell/')) {
    return false
  }

  // 🚫 DISALLOW: Favorites page (may be empty)
  if (normalized === '/favorites' || normalized.startsWith('/favorites/')) {
    return false
  }

  // Default: disallow unknown routes (be conservative)
  return false
}

