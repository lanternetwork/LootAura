'use client'
import Link from 'next/link'
import UserProfile from '@/components/UserProfile'

export function Header() {
  return (
    <nav className="bg-white border-b">
      <div className="w-full px-4 py-3">
        <div className="flex justify-between items-center">
          <Link href="/" className="flex items-center" aria-label="LootAura Home">
            <img src="/brand/sitelogo.svg" alt="LootAura" className="h-14 w-auto" />
            <span className="ml-2 text-2xl font-bold text-amber-600">LootAura</span>
          </Link>
          
          <div className="flex gap-6 items-center">
            <Link 
              href="/sales" 
              className="text-neutral-700 hover:text-amber-600 font-medium"
            >
              Browse Sales
            </Link>
            <Link 
              href="/favorites" 
              className="text-neutral-700 hover:text-amber-600 font-medium"
            >
              Favorites
            </Link>
            <Link 
              href="/sell/new" 
              className="text-neutral-700 hover:text-amber-600 font-medium"
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
