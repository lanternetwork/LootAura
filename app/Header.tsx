'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import UserProfile from '@/components/UserProfile'
import { useMobileFilter } from '@/contexts/MobileFilterContext'
import { useAuth } from '@/lib/hooks/useAuth'

export function Header() {
  const pathname = usePathname()
  const isSalesPage = pathname === '/sales'
  const { openFilterSheet } = useMobileFilter()
  const { data: user } = useAuth()
  
  // Mobile filter button handler
  const handleMobileFilterClick = () => {
    if (isSalesPage) {
      openFilterSheet()
    }
  }
  
  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 shadow-sm h-16">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex justify-between items-center h-full">
          <Link href="/" className="flex items-center gap-2 text-base sm:text-xl font-bold text-[#3A2268] whitespace-nowrap">
            <img
              src="/brand/sitelogo.svg"
              alt="Loot Aura Logo"
              className="w-[30px] h-[30px] sm:w-10 sm:h-10"
              style={{ backgroundColor: 'transparent', objectFit: 'contain' }}
            />
            Loot Aura
          </Link>
          
          <div className="flex gap-3 sm:gap-6 items-center">
            <Link 
              href="/sales" 
              className="hidden sm:block text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 transition-colors whitespace-nowrap"
            >
              Browse Sales
            </Link>
            <Link 
              href="/favorites" 
              className="hidden md:block text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 transition-colors whitespace-nowrap"
            >
              Favorites
            </Link>
            {user && (
              <Link 
                href="/dashboard" 
                className="hidden md:block text-sm sm:text-base text-[#3A2268] hover:text-[#3A2268]/80 transition-colors whitespace-nowrap"
              >
                Dashboard
              </Link>
            )}
            <Link 
              href="/sell/new" 
              className="text-xs sm:text-sm md:text-base text-[#3A2268] hover:text-[#3A2268]/80 transition-colors whitespace-nowrap"
            >
              Post Your Sale
            </Link>
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
            <UserProfile />
          </div>
        </div>
      </div>
    </nav>
  )
}
