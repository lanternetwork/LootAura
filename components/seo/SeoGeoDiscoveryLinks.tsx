import Link from 'next/link'
import type { MetroGeoLinks } from '@/lib/seo/geoLinking'

type Props = {
  links: MetroGeoLinks
  showPrimary?: boolean
}

/** Crawlable geographic discovery links for city/weekend SEO surfaces. */
export default function SeoGeoDiscoveryLinks({ links, showPrimary = true }: Props) {
  return (
    <nav className="mt-6 space-y-4" aria-label="Geographic discovery">
      {showPrimary && (
        <ul className="flex flex-wrap gap-3">
          <li>
            <Link
              href={links.city.href}
              className="inline-flex min-h-10 items-center rounded-full border border-purple-200 bg-white px-4 py-2 text-sm font-semibold text-[#3A2268] shadow-sm transition hover:border-purple-300 hover:bg-purple-50"
            >
              {links.city.label} →
            </Link>
          </li>
          <li>
            <Link
              href={links.weekend.href}
              className="inline-flex min-h-10 items-center rounded-full border border-purple-200 bg-white px-4 py-2 text-sm font-semibold text-[#3A2268] shadow-sm transition hover:border-purple-300 hover:bg-purple-50"
            >
              {links.weekend.label} →
            </Link>
          </li>
        </ul>
      )}
      {links.nearbyMetros.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-800">Explore nearby metros</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:gap-3">
            {links.nearbyMetros.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition hover:border-[#3A2268]/30 hover:bg-purple-50 hover:text-[#3A2268] lg:inline-flex lg:justify-start"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  )
}
