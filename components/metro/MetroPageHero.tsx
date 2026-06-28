import Link from 'next/link'
import { formatFreshnessLabel } from '@/lib/seo/copy/cityPageCopy'

type MetroPageHeroProps = {
  headline: string
  activeListingCount: number
  radiusMiles: number
  city: string
  weekend?: boolean
  lastUpdatedAt: string | null
  interactiveMapHref: string
  postSaleHref?: string
  tagline?: string
}

export default function MetroPageHero({
  headline,
  activeListingCount,
  radiusMiles,
  city,
  weekend = false,
  lastUpdatedAt,
  interactiveMapHref,
  postSaleHref = '/sell/new',
  tagline,
}: MetroPageHeroProps) {
  const freshnessLabel =
    activeListingCount > 0 && lastUpdatedAt ? formatFreshnessLabel(lastUpdatedAt) : null
  const scopeLabel = weekend ? 'this weekend' : 'active now'

  return (
    <header className="relative overflow-hidden rounded-2xl border border-purple-200/60 bg-gradient-to-br from-[#3A2268] via-[#4a2f7a] to-[#2f1a52] px-5 py-8 text-white shadow-lg sm:px-8 sm:py-10">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-purple-300/10 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-purple-200 sm:text-sm">LootAura</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
          {headline}
        </h1>

        {tagline && <p className="mt-3 max-w-2xl text-sm text-purple-100 sm:text-base">{tagline}</p>}

        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-200">Active listings</p>
            <p className="mt-1 text-4xl font-bold tabular-nums sm:text-5xl">{activeListingCount}</p>
            <p className="mt-1 text-sm text-purple-100">{scopeLabel}</p>
          </div>
          <div className="min-w-[140px]">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-200">Search radius</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{radiusMiles} mi</p>
            <p className="mt-1 text-sm text-purple-100">from downtown {city}</p>
          </div>
          {freshnessLabel && (
            <div className="min-w-[140px]">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-200">Freshness</p>
              <p className="mt-1 text-sm font-medium text-emerald-200 sm:text-base">{freshnessLabel}</p>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href={interactiveMapHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#3A2268] shadow-sm transition hover:bg-purple-50"
          >
            View Interactive Map
          </Link>
          <Link
            href={postSaleHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            Post Your Yard Sale
          </Link>
        </div>
      </div>
    </header>
  )
}

export function metroFreshnessLabel(lastUpdatedAt: string | null, inventoryCount: number): string | null {
  if (inventoryCount <= 0) return null
  return formatFreshnessLabel(lastUpdatedAt)
}
