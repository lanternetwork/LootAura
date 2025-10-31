'use client'
import Link from 'next/link'
import UserProfile from '@/components/UserProfile'

export function Header() {
  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-aura-navy/5">
      <div className="w-full px-4 py-3">
        <div className="mx-auto max-w-7xl flex justify-between items-center">
          <Link href="/" className="flex items-center gap-0.5" aria-label="LootAura Home">
            <img src="/brand/sitelogo.svg" alt="LootAura" className="h-14 w-auto" />
            <span className="text-2xl font-bold text-aura-navy">LootAura</span>
          </Link>
          
          <div className="flex gap-6 items-center">
            <Link 
              href="/sales" 
              className="text-aura-navy hover:text-aura-gold font-medium transition-colors"
            >
              Sales
            </Link>
            <Link 
              href="/sell/new" 
              className="text-aura-navy hover:text-aura-gold font-medium transition-colors"
            >
              Post a sale
            </Link>
            <UserProfile />
          </div>
        </div>
      </div>
    </nav>
  )
}
