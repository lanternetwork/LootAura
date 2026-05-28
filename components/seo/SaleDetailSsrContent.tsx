import Link from 'next/link'
import { getSaleCoverUrl } from '@/lib/images/cover'
import { formatDateOnly } from '@/lib/display/date'
import { displayAddress } from '@/lib/display/address'
import type { ListingGeoLinks, SeoGeoLink } from '@/lib/seo/geoLinking'
import SeoListingDiscoveryLinks from '@/components/seo/SeoListingDiscoveryLinks'
import type { Sale, SaleItem } from '@/lib/types'

type NearbySale = Sale & { distance_m?: number }

type Props = {
  sale: Sale
  items?: SaleItem[]
  nearbySales?: NearbySale[]
  geoLinks: ListingGeoLinks
  nearbyListingLinks: SeoGeoLink[]
}

function formatSaleDates(sale: Sale): string | null {
  if (!sale.date_start) return null
  if (sale.date_end && sale.date_end !== sale.date_start) {
    return `${formatDateOnly(sale.date_start)} – ${formatDateOnly(sale.date_end)}`
  }
  return formatDateOnly(sale.date_start)
}

/** Server-rendered sale detail — crawlable without client JS (Phase 2A). */
export default function SaleDetailSsrContent({
  sale,
  items = [],
  geoLinks,
  nearbyListingLinks,
}: Props) {
  const address = displayAddress(sale.address, sale.city, sale.state)
  const dateLabel = formatSaleDates(sale)
  const cover = getSaleCoverUrl(sale)
  const gallery = [
    ...(cover?.url ? [cover.url] : []),
    ...(Array.isArray(sale.images)
      ? sale.images.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : []),
  ].filter((url, i, arr) => arr.indexOf(url) === i)

  return (
    <article className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" data-seo-sale-detail="crawlable">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">
          Home
        </Link>
        {' / '}
        <Link href="/sales" className="hover:text-gray-700">
          Sales
        </Link>
        {geoLinks.city && (
          <>
            {' / '}
            <Link href={geoLinks.city.href} className="hover:text-gray-700">
              {geoLinks.metro?.city}
            </Link>
          </>
        )}
        {' / '}
        <span className="text-gray-900">{sale.title || 'Sale'}</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">{sale.title || 'Yard Sale'}</h1>

      {dateLabel && <p className="mt-2 text-gray-700">{dateLabel}</p>}
      {sale.time_start && <p className="text-sm text-gray-600">Starts {sale.time_start}</p>}
      {address && <p className="mt-2 text-gray-800">{address}</p>}

      {sale.description && (
        <div className="prose prose-sm mt-4 max-w-none text-gray-700">
          <p>{sale.description}</p>
        </div>
      )}

      {gallery.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3" aria-label="Sale photos">
          {gallery.map((url) => (
            <li key={url}>
              <img
                src={url}
                alt={`${sale.title || 'Sale'} photo`}
                width={400}
                height={300}
                loading="lazy"
                className="h-40 w-auto max-w-full rounded-lg object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Items</h2>
          <ul className="mt-2 list-disc pl-5 text-gray-700">
            {items.map((item) => (
              <li key={item.id}>
                {item.name}
                {item.category ? ` (${item.category})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <SeoListingDiscoveryLinks geo={geoLinks} nearbyListings={nearbyListingLinks} />
    </article>
  )
}
