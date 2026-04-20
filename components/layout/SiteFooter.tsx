'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BADGES } from '@/app/featured/badges.manifest'

export function SiteFooter() {
  const pathname = usePathname()
  const currentYear = new Date().getFullYear()
  const footerBadges = BADGES
  
  // Hide footer on /sales page and auth pages
  if (pathname === '/sales' || pathname?.startsWith('/auth/')) {
    return null
  }

  return (
    <footer role="contentinfo" className="bg-white border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* Brand and Description */}
          <div className="flex-1">
            <h3 className="text-base font-bold text-[#3A2268] mb-2">Loot Aura</h3>
            <p className="text-sm text-neutral-600 max-w-md">
              Map-first yard sale finder. Discover yard, garage, and estate sales near you.
            </p>
          </div>

          {/* Navigation Links */}
          <nav aria-label="Footer" className="flex flex-col gap-2 md:flex-row md:gap-6">
            <Link
              href="/about"
              className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline transition-colors"
            >
              About
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline transition-colors"
            >
              Terms of Use
            </Link>
          </nav>
        </div>

        {/* Footer verification badges */}
        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            {footerBadges.map((badge) => (
              <a
                key={`${badge.href}|${badge.img}`}
                href={badge.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={badge.name}
              >
                <img
                  src={badge.img}
                  alt={badge.name}
                  className="h-5 w-auto grayscale opacity-60 transition-opacity duration-150 hover:opacity-80"
                  loading="eager"
                />
              </a>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs text-neutral-500 text-center md:text-left">
            © {currentYear} Loot Aura. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

