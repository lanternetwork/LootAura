import Link from 'next/link'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
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
      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-lg">
        {cover?.url ? (
          <Link href={href} className="block aspect-[4/3] overflow-hidden bg-gray-100 lg:aspect-[16/10]">
            <img
              src={cover.url}
              alt={cover.alt}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          </Link>
        ) : (
          <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-gray-100 lg:aspect-[16/10]">
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-6 md:p-8">
              <SalePlaceholder className="max-w-[100%] max-h-[100%] w-auto h-auto opacity-90 scale-[1.69]" />
            </div>
          </Link>
        )}

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-2">
            <h2 className="flex-1 text-lg font-bold leading-snug text-gray-900 sm:text-xl">
              <Link href={href} className="hover:text-[#3A2268]">
                {sale.title || 'Yard Sale'}
              </Link>
            </h2>
            {showEstateBadge && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
                Estate Sale
              </span>
            )}
          </div>

          {dateLabel && (
            <p className="mt-3 text-sm font-semibold text-[#3A2268] sm:text-base">{dateLabel}</p>
          )}

          <p className="mt-2 text-sm font-medium text-gray-800">
            {[sale.city, sale.state].filter(Boolean).join(', ')}
          </p>
          {street && <p className="mt-1 text-sm leading-relaxed text-gray-600">{street}</p>}

          {badges.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Freshness">
              {badges.map((badge) => (
                <li
                  key={badge}
                  className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                >
                  {badge}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-auto pt-5">
            <Link
              href={href}
              className="inline-flex min-h-10 items-center rounded-lg bg-[#3A2268]/5 px-3 py-2 text-sm font-semibold text-[#3A2268] transition group-hover:bg-[#3A2268] group-hover:text-white"
            >
              View Details →
            </Link>
          </p>
        </div>
      </article>
    </li>
  )
}
