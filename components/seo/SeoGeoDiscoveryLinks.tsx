import Link from 'next/link'
import type { MetroGeoLinks } from '@/lib/seo/geoLinking'

type Props = {
  links: MetroGeoLinks
  showPrimary?: boolean
}

/** Crawlable geographic discovery links for city/weekend SEO surfaces (Phase 4). */
export default function SeoGeoDiscoveryLinks({ links, showPrimary = true }: Props) {
  return (
    <nav className="mt-4 space-y-3" aria-label="Geographic discovery">
      {showPrimary && (
        <ul className="flex flex-wrap gap-4 text-sm">
          <li>
            <Link href={links.city.href} className="font-medium text-purple-700 hover:text-purple-900">
              {links.city.label} →
            </Link>
          </li>
          <li>
            <Link href={links.weekend.href} className="font-medium text-purple-700 hover:text-purple-900">
              {links.weekend.label} →
            </Link>
          </li>
        </ul>
      )}
      {links.nearbyMetros.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700">Nearby metros</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {links.nearbyMetros.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 hover:border-purple-400"
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
