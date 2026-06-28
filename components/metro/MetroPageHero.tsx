import Link from 'next/link'
import { formatFreshnessLabel } from '@/lib/seo/copy/cityPageCopy'

type MetroPageHeroProps = {
  headline: string
  subtitle: string
  freshnessLabel: string | null
  interactiveMapHref: string
  postSaleHref?: string
}

export default function MetroPageHero({
  headline,
  subtitle,
  freshnessLabel,
  interactiveMapHref,
  postSaleHref = '/sell/new',
}: MetroPageHeroProps) {
  return (
    <header className="rounded-2xl border border-purple-100 bg-gradient-to-br from-white via-purple-50/40 to-white px-6 py-8 shadow-sm sm:px-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#3A2268]">LootAura</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{headline}</h1>
      <p className="mt-3 text-lg text-gray-700">{subtitle}</p>
      {freshnessLabel && (
        <p className="mt-2 text-sm font-medium text-emerald-800">{freshnessLabel}</p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={interactiveMapHref}
          className="inline-flex items-center justify-center rounded-lg bg-[#3A2268] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2f1a52]"
        >
          View Interactive Map
        </Link>
        <Link
          href={postSaleHref}
          className="inline-flex items-center justify-center rounded-lg border border-[#3A2268] bg-white px-5 py-2.5 text-sm font-semibold text-[#3A2268] transition hover:bg-purple-50"
        >
          Post Your Yard Sale
        </Link>
      </div>
    </header>
  )
}

export function metroFreshnessLabel(lastUpdatedAt: string | null, inventoryCount: number): string | null {
  if (inventoryCount <= 0) return null
  return formatFreshnessLabel(lastUpdatedAt)
}
