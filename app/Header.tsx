'use client'
import Link from 'next/link'
import UserProfile from '@/components/UserProfile'

export function Header() {
  return (
    <nav className="bg-aura-cream border-b border-aura-navy/10">
      <div className="w-full px-4 py-3">
        <div className="flex justify-between items-center">
          <Link href="/" className="flex items-center gap-0.5" aria-label="LootAura Home">
            <img src="/brand/sitelogo.svg" alt="LootAura" className="h-14 w-auto" />
            <span className="text-2xl font-bold text-aura-navy">LootAura</span>
          </Link>
          
          <div className="flex gap-6 items-center">
            <Link 
              href="/sales" 
              className="text-aura-navy hover:text-aura-gold font-medium transition-colors"
            >
              Browse Sales
            </Link>
            <Link 
              href="/favorites" 
              className="text-aura-navy hover:text-aura-gold font-medium transition-colors"
            >
              Favorites
            </Link>
            <Link 
              href="/sell/new" 
              className="text-aura-navy hover:text-aura-gold font-medium transition-colors"
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
