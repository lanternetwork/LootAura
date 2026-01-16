'use client'
import Link from 'next/link'

export function TopNav() {
  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 shadow-sm h-14 sm:h-16">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-[#3A2268]">
            <span className="inline-flex items-center justify-center">
              <img
                src="/sitelogo.svg"
                alt="Loot Aura logo"
                className="h-7 w-auto"
              />
            </span>
            <span className="hidden md:inline">Loot Aura</span>
          </Link>

          {/* Right side - links and sign in button */}
          <div className="flex items-center gap-4 md:gap-6">
            {/* Browse sales and Post a sale links */}
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
            </div>

          {/* Sign in button */}
          <Link
            href="/auth/signin"
            className="btn-accent-secondary whitespace-nowrap"
          >
            Sign in
          </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

