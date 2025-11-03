'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import UserProfile from '@/components/UserProfile'
import { useMobileFilter } from '@/contexts/MobileFilterContext'
import { useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function Header() {
  const pathname = usePathname()
  const isSalesPage = pathname === '/sales'
  const { openFilterSheet } = useMobileFilter()
  const [hasUser, setHasUser] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const logoRef = useRef<HTMLAnchorElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)
  const adminRef = useRef<HTMLDivElement | null>(null)
  const userRef = useRef<HTMLDivElement | null>(null)
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
        if (!collapsed) setMenuOpen(false)
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
  
  // Mobile filter button handler
  const handleMobileFilterClick = () => {
    if (isSalesPage) {
      openFilterSheet()
    }
  }
  
  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 shadow-sm h-16">
      <div ref={containerRef} className="w-full px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex justify-between items-center h-full">
          <Link ref={logoRef} href="/" className="flex items-center gap-2 text-base sm:text-xl font-bold text-[#3A2268] whitespace-nowrap">
            <img
              src="/brand/sitelogo.svg"
              alt="Loot Aura Logo"
              className="w-[30px] h-[30px] sm:w-10 sm:h-10"
              style={{ backgroundColor: 'transparent', objectFit: 'contain' }}
            />
            Loot Aura
          </Link>
          
          <div className="flex gap-3 sm:gap-6 items-center">
            {/* Main links cluster */}
            <div ref={mainRef} className={`${isCollapsed ? 'hidden' : 'hidden sm:flex'} items-center gap-3 sm:gap-6`} aria-label="Main navigation">
              <Link href="/sales" className="text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Browse Sales</Link>
              <Link href="/favorites" className="hidden md:block text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Favorites</Link>
              <Link href="/sell/new" className="text-xs sm:text-sm md:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Post Your Sale</Link>
            </div>
            {/* Admin links cluster */}
            <div ref={adminRef} className={`${isCollapsed ? 'hidden' : 'hidden md:flex'} items-center gap-3`} aria-label="Account">
              {hasUser && <Link href="/profile" className="text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Profile</Link>}
              {hasUser && <Link href="/dashboard" className="text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 whitespace-nowrap">Dashboard</Link>}
            </div>
            {/* Mobile-only filter button for /sales page */}
            {isSalesPage && (
              <button
                onClick={handleMobileFilterClick}
                className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Open filters"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
            )}
            {/* Hamburger trigger (shows when collapsed, or on sm and below) */}
            <button
              aria-label="Open navigation menu"
              aria-controls="site-menu"
              aria-expanded={menuOpen}
              className={`flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors ${isCollapsed ? '' : 'sm:hidden'}`}
              onClick={() => setMenuOpen(v => !v)}
            >
              <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div ref={userRef} className="flex items-center">
              <UserProfile />
            </div>
          </div>
        </div>
      </div>
      {menuOpen && (
        <div role="dialog" aria-modal="true" id="site-menu" className="sm:hidden border-t bg-white shadow-md">
          <div className="px-4 py-3 flex flex-col gap-2">
            <Link href="/sales" onClick={()=>setMenuOpen(false)} className="text-[#3A2268]">Browse Sales</Link>
            <Link href="/favorites" onClick={()=>setMenuOpen(false)} className="text-[#3A2268]">Favorites</Link>
            <Link href="/sell/new" onClick={()=>setMenuOpen(false)} className="text-[#3A2268]">Post Your Sale</Link>
            {hasUser && <hr className="my-2" />}
            {hasUser && <Link href="/profile" onClick={()=>setMenuOpen(false)} className="text-[#3A2268]">Profile</Link>}
            {hasUser && <Link href="/dashboard" onClick={()=>setMenuOpen(false)} className="text-[#3A2268]">Dashboard</Link>}
          </div>
        </div>
      )}
    </nav>
  )
}
