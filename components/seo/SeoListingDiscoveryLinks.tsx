import Link from 'next/link'
import type { ListingGeoLinks, SeoGeoLink } from '@/lib/seo/geoLinking'

type Props = {
  geo: ListingGeoLinks
  nearbyListings: SeoGeoLink[]
}

/** Crawlable discovery links on listing detail SSR block (Phase 4). */
export default function SeoListingDiscoveryLinks({ geo, nearbyListings }: Props) {
  return (
    <nav className="mt-8 space-y-4 border-t border-gray-200 pt-6" aria-label="Discover more sales">
      {(geo.city || geo.weekend) && (
        <div>
          <p className="text-sm font-medium text-gray-900">Browse this area</p>
          <ul className="mt-2 space-y-1 text-sm">
            {geo.city && (
              <li>
                <Link href={geo.city.href} className="text-purple-700 hover:text-purple-900">
                  {geo.city.label}
                </Link>
              </li>
            )}
            {geo.weekend && (
              <li>
                <Link href={geo.weekend.href} className="text-purple-700 hover:text-purple-900">
                  {geo.weekend.label}
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      {geo.nearbyMetros.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-900">Nearby metros</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {geo.nearbyMetros.map((link) => (
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

      {nearbyListings.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-900">Nearby sales</p>
          <ul className="mt-2 space-y-1 text-sm">
            {nearbyListings.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-purple-700 hover:text-purple-900">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p>
        <Link href="/sales" className="text-sm font-medium text-purple-700 hover:text-purple-900">
          Browse all sales on the map
        </Link>
      </p>
    </nav>
  )
}
