import Link from 'next/link'
import { isEstateSaleTitle } from '@/lib/admin/social/isEstateSaleTitle'
import { getListingCanonicalPath } from '@/lib/seo/canonical'
import { getSaleCoverUrl } from '@/lib/images/cover'
import { formatDateOnly } from '@/lib/display/date'
import { stripTrailingUsCountryFromAddressLine } from '@/lib/display/stripTrailingUsCountry'
import type { Sale } from '@/lib/types'

type Props = {
  sale: Sale
  badges?: string[]
}

function formatSaleDates(sale: Sale): string | null {
  if (sale.date_start && sale.date_end && sale.date_end !== sale.date_start) {
    return `${formatDateOnly(sale.date_start, { month: 'short', day: 'numeric' })} – ${formatDateOnly(sale.date_end, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (sale.date_start) {
    return formatDateOnly(sale.date_start)
  }
  return null
}

function streetLine(sale: Sale): string | null {
  const trimmed = sale.address?.trim()
  if (!trimmed) return null
  return stripTrailingUsCountryFromAddressLine(trimmed)
}

/** Lightweight SEO listing card — snapshot-backed, no marketplace interactions. */
export default function SeoSaleListItem({ sale, badges = [] }: Props) {
  const href = getListingCanonicalPath(sale.id)
  const cover = getSaleCoverUrl(sale)
  const dateLabel = formatSaleDates(sale)
  const street = streetLine(sale)
  const showEstateBadge = isEstateSaleTitle(sale.title)

  return (
    <li className="list-none">
      <article className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-purple-200 hover:shadow-md">
        {cover?.url ? (
          <Link href={href} className="block aspect-[16/10] overflow-hidden bg-gray-100">
            <img
              src={cover.url}
              alt={cover.alt}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </Link>
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-purple-50 to-gray-100">
            <span className="text-sm font-medium text-gray-500">Yard sale listing</span>
          </div>
        )}

        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap items-start gap-2">
            <h2 className="flex-1 text-lg font-semibold leading-snug text-gray-900">
              <Link href={href} className="hover:text-[#3A2268]">
                {sale.title || 'Yard Sale'}
              </Link>
            </h2>
            {showEstateBadge && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                Estate Sale
              </span>
            )}
          </div>

          {dateLabel && <p className="mt-2 text-sm text-gray-600">{dateLabel}</p>}

          <p className="mt-1 text-sm font-medium text-gray-800">
            {[sale.city, sale.state].filter(Boolean).join(', ')}
          </p>
          {street && <p className="mt-1 text-sm text-gray-600">{street}</p>}

          {badges.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Freshness">
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

          <p className="mt-4">
            <Link href={href} className="text-sm font-semibold text-[#3A2268] hover:text-[#2f1a52]">
              View Details →
            </Link>
          </p>
        </div>
      </article>
    </li>
  )
}
