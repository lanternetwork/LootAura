import { formatFreshnessLabel } from '@/lib/seo/copy/cityPageCopy'
import type { SeoMetro } from '@/lib/seo/types'

type MetroPageStatsStripProps = {
  activeListingCount: number
  radiusMiles: number
  lastUpdatedAt: string | null
  nearbyMetros: SeoMetro[]
}

export default function MetroPageStatsStrip({
  activeListingCount,
  radiusMiles,
  lastUpdatedAt,
  nearbyMetros,
}: MetroPageStatsStripProps) {
  const freshness = formatFreshnessLabel(lastUpdatedAt)
  const nearbyLabel =
    nearbyMetros.length > 0
      ? nearbyMetros
          .slice(0, 3)
          .map((m) => `${m.city}, ${m.state}`)
          .join(' · ')
      : '—'

  const stats = [
    {
      label: 'Active listings',
      value: String(activeListingCount),
    },
    {
      label: 'Search radius',
      value: `${radiusMiles} mi`,
    },
    {
      label: 'Last updated',
      value: freshness,
    },
    {
      label: 'Nearby metros',
      value: nearbyLabel,
    },
  ]

  return (
    <section
      className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4"
      aria-label="Metro inventory stats"
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-purple-100/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#3A2268]/70">{stat.label}</p>
          <p className="mt-1 text-sm font-semibold leading-snug text-gray-900 sm:text-base">{stat.value}</p>
        </div>
      ))}
    </section>
  )
}
