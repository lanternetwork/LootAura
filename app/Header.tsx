'use client'
import Link from 'next/link'
import UserProfile from '@/components/UserProfile'

export function Header() {
  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-sm h-16">
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
            <Link 
              href="/sell/new" 
              className="text-xs sm:text-sm md:text-base text-[#3A2268] hover:text-[#3A2268]/80 transition-colors whitespace-nowrap"
            >
              Post Your Sale
            </Link>
            <UserProfile />
          </div>
        </div>
      </div>
    </nav>
  )
}
