'use client'
import Link from 'next/link'
import UserProfile from '@/components/UserProfile'

export function Header() {
  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-sm h-16">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex justify-between items-center h-full">
          <Link href="/" className="text-xl font-bold text-[#3A2268]">
            Loot Aura
          </Link>
          
          <div className="flex gap-6 items-center">
            <Link 
              href="/sales" 
              className="text-[#3A2268] hover:text-[#3A2268]/80 transition-colors"
            >
              Browse Sales
            </Link>
            <Link 
              href="/favorites" 
              className="text-[#3A2268] hover:text-[#3A2268]/80 transition-colors"
            >
              Favorites
            </Link>
            <Link 
              href="/sell/new" 
              className="text-[#3A2268] hover:text-[#3A2268]/80 transition-colors"
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
