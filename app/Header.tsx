'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import UserProfile from '@/components/UserProfile'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function Header() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [hasUser, setHasUser] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const logoRef = useRef<HTMLAnchorElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)
  const adminRef = useRef<HTMLDivElement | null>(null)
  const userRef = useRef<HTMLDivElement | null>(null)
  
  // Check if we're on a sale detail page
  const isSaleDetailPage = pathname?.startsWith('/sales/') && pathname !== '/sales'
  
  // Build back URL with viewport params if they exist
  const backUrl = (() => {
    if (!isSaleDetailPage) return '/sales'
    try {
      const lat = searchParams?.get('lat')
      const lng = searchParams?.get('lng')
      const zoom = searchParams?.get('zoom')
      return lat && lng && zoom
        ? `/sales?lat=${lat}&lng=${lng}&zoom=${zoom}`
        : '/sales'
    } catch {
      return '/sales'
    }
  })()
  
  
  useEffect(() => {
    const sb = createSupabaseBrowserClient()
    sb.auth.getUser().then(({ data }) => setHasUser(!!data.user)).catch(() => setHasUser(false))
  }, [])
  
  // Collision-aware collapse using ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    let last: boolean | null = null
    const compute = () => {
      const cw = el.clientWidth
      const lw = logoRef.current?.clientWidth ?? 0
      const mw = mainRef.current?.scrollWidth ?? 0
      const aw = adminRef.current?.scrollWidth ?? 0
      const uw = userRef.current?.scrollWidth ?? 0
      const gaps = 64 // larger safety margin to avoid visual collision
      const need = lw + mw + aw + uw + gaps
      const collapsed = need > cw
      if (collapsed !== last) {
        last = collapsed
        setIsCollapsed(collapsed)
      }
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    })
    ro.observe(el)
    if (logoRef.current) ro.observe(logoRef.current)
    if (mainRef.current) ro.observe(mainRef.current)
    if (adminRef.current) ro.observe(adminRef.current)
    if (userRef.current) ro.observe(userRef.current)
    compute()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])
  
  // Hide header in embed mode, but show it when nativeFooter=1 is present
  // nativeFooter=1 means we're in a native app with native footer, so keep web header visible
  const isEmbed = searchParams.get('embed') === '1'
  const isNativeFooter = searchParams.get('nativeFooter') === '1'
  
  // Helper to send navigation message to native when nativeFooter=1
  // Must be defined before any conditional returns (React Hooks rule)
  const handleNativeNavigation = useCallback((path: string, e?: React.MouseEvent) => {
    if (isNativeFooter && typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
      e?.preventDefault()
      e?.stopPropagation()
      const message = { type: 'NAVIGATE', path }
      ;(window as any).ReactNativeWebView.postMessage(JSON.stringify(message))
      return true
    }
    return false
  }, [isNativeFooter])
  
  if (isEmbed && !isNativeFooter) {
    return null
  }
  
  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 shadow-sm h-14 sm:h-16">
      <div ref={containerRef} className="w-full px-3 sm:px-6 lg:px-8 h-full">
        <div className="flex justify-between items-center h-full gap-2">
          {/* Mobile: Show back button on sale detail pages only, otherwise show logo */}
          {isSaleDetailPage ? (
            <>
              <Link
                href={backUrl}
                onClick={(e) => handleNativeNavigation(backUrl, e)}
                className="sm:hidden flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors -ml-2"
                aria-label="Back to sales"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              {/* Desktop: Always show logo */}
              <Link ref={logoRef} href="/" onClick={(e) => handleNativeNavigation('/', e)} className="hidden sm:flex items-center gap-2 text-base sm:text-xl font-bold text-[#3A2268] whitespace-nowrap">
                <span className="inline-flex items-center justify-center">
                  <img
                    src="/sitelogo.svg"
                    alt="Loot Aura logo"
                    className="h-7 w-auto"
                  />
                </span>
                <span>Loot Aura</span>
              </Link>
            </>
          ) : (
            <Link ref={logoRef} href="/" onClick={(e) => handleNativeNavigation('/', e)} className="flex items-center gap-2 text-base sm:text-xl font-bold text-[#3A2268] whitespace-nowrap">
              <span className="inline-flex items-center justify-center">
                <img
                  src="/sitelogo.svg"
                  alt="Loot Aura logo"
                  className="h-7 w-auto"
                />
              </span>
              <span>Loot Aura</span>
            </Link>
          )}
          
          <div className="flex gap-2 sm:gap-6 items-center shrink-0">
            {/* Main links cluster - Text links for large screens */}
            <div ref={mainRef} className={`${isCollapsed ? 'hidden' : 'hidden lg:flex'} items-center gap-3 sm:gap-6`} aria-label="Main navigation">
              <Link href="/sales" onClick={(e) => handleNativeNavigation('/sales', e)} className="text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Browse Sales</Link>
              <Link href="/favorites" onClick={(e) => handleNativeNavigation('/favorites', e)} className="text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Favorites</Link>
              <Link href="/sell/new" onClick={(e) => handleNativeNavigation('/sell/new', e)} className="text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Post Your Sale</Link>
            </div>
            {/* Main links cluster - Icon buttons for medium screens (when text would be too tight) */}
            <div className={`${isCollapsed ? 'hidden' : 'hidden sm:flex lg:hidden'} items-center gap-1 shrink-0`} aria-label="Main navigation">
              <Link
                href="/sales"
                onClick={(e) => handleNativeNavigation('/sales', e)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Browse Sales"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
              <Link
                href="/favorites"
                onClick={(e) => handleNativeNavigation('/favorites', e)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Favorites"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </Link>
              <Link
                href="/sell/new"
                onClick={(e) => handleNativeNavigation('/sell/new', e)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Post Your Sale"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Link>
            </div>
            {/* Visual divider between clusters (desktop only) */}
            <div className={`${isCollapsed ? 'hidden' : 'hidden md:block'} h-6 w-px bg-slate-200`} aria-hidden="true"></div>
            {/* Admin links cluster */}
            <div ref={adminRef} className={`${isCollapsed ? 'hidden' : 'hidden md:flex'} items-center gap-3`} aria-label="Account">
              {hasUser && <Link href="/dashboard" onClick={(e) => handleNativeNavigation('/dashboard', e)} className="text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Dashboard</Link>}
            </div>
            {/* Mobile-only navigation icons */}
            <div className="sm:hidden flex items-center gap-1 shrink-0">
              <Link
                href="/sales"
                onClick={(e) => handleNativeNavigation('/sales', e)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Browse Sales"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
              <Link
                href="/favorites"
                onClick={(e) => handleNativeNavigation('/favorites', e)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Favorites"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </Link>
              <Link
                href="/sell/new"
                onClick={(e) => handleNativeNavigation('/sell/new', e)}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Post Your Sale"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Link>
              {hasUser && (
                <Link
                  href="/dashboard"
                  onClick={(e) => handleNativeNavigation('/dashboard', e)}
                  className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                  aria-label="Dashboard"
                >
                  <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </Link>
              )}
            </div>
            <div ref={userRef} className="flex items-center">
              <UserProfile />
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
