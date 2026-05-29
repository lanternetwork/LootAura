import Link from 'next/link'
import { getListingCanonicalPath } from '@/lib/seo/canonical'
import { getSaleCoverUrl } from '@/lib/images/cover'
import { formatDateOnly } from '@/lib/display/date'
import { displayAddress } from '@/lib/display/address'
import type { Sale } from '@/lib/types'

type Props = {
  sale: Sale
  badges?: string[]
}

/** Crawlable listing row — plain HTML links and images for SEO inventory blocks. */
export default function SeoSaleListItem({ sale, badges = [] }: Props) {
  const href = getListingCanonicalPath(sale.id)
  const cover = getSaleCoverUrl(sale)
  const address = displayAddress(sale.address, sale.city, sale.state)
  const dateLabel =
    sale.date_start && sale.date_end && sale.date_end !== sale.date_start
      ? `${formatDateOnly(sale.date_start, { month: 'short', day: 'numeric' })} – ${formatDateOnly(sale.date_end, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : sale.date_start
        ? formatDateOnly(sale.date_start)
        : null

  return (
    <li className="border-b border-gray-200 py-4 last:border-b-0">
      <article>
        <h2 className="text-lg font-semibold text-gray-900">
          <Link href={href}>{sale.title || 'Yard Sale'}</Link>
        </h2>
        {dateLabel && <p className="mt-1 text-sm text-gray-600">{dateLabel}</p>}
        {badges.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Freshness">
            {badges.map((badge) => (
              <li
                key={badge}
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
              >
                {badge}
              </li>
            ))}
          </ul>
        )}
        {address && <p className="mt-1 text-sm text-gray-700">{address}</p>}
        {sale.description && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-600">{sale.description}</p>
        )}
        {cover?.url && (
          <Link href={href} className="mt-3 inline-block">
            <img
              src={cover.url}
              alt={cover.alt}
              width={320}
              height={180}
              loading="lazy"
              className="h-32 w-auto max-w-full rounded-lg object-cover"
            />
          </Link>
        )}
        <p className="mt-2">
          <Link href={href} className="text-sm font-medium text-purple-700 hover:text-purple-900">
            View sale details
          </Link>
        </p>
      </article>
    </li>
  )
}
