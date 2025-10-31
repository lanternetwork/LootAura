'use client'
import Link from 'next/link'

export function TopNav() {
  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-sm h-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold text-[#3A2268]">
            Loot Aura
          </Link>

          {/* Center links - hidden on mobile */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/sales"
              className="text-[#3A2268] hover:text-[#3A2268]/80 transition-colors"
            >
              Browse sales
            </Link>
            <Link
              href="/sell/new"
              className="text-[#3A2268] hover:text-[#3A2268]/80 transition-colors"
            >
              Post a sale
            </Link>
            <Link
              href="/how-it-works"
              className="text-[#3A2268] hover:text-[#3A2268]/80 transition-colors"
            >
              How it works
            </Link>
          </div>

          {/* Sign in button */}
          <Link
            href="/auth/signin"
            className="px-4 py-2 rounded-lg bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  )
}

