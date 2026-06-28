import MetroMapSnapshot from '@/components/metro/MetroMapSnapshot'
import type { MetroMapPin, MetroMapViewport } from '@/lib/seo/metroMapViewport'

type MetroMapSectionProps = {
  pins: MetroMapPin[]
  viewport: MetroMapViewport
  heading?: string
  listingCount?: number
}

export default function MetroMapSection({
  pins,
  viewport,
  heading = 'Metro map snapshot',
  listingCount,
}: MetroMapSectionProps) {
  return (
    <section className="mt-8 lg:mt-10" aria-label={heading}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">{heading}</h2>
        {listingCount != null && listingCount > 0 && (
          <span className="rounded-full bg-[#3A2268]/10 px-3 py-1 text-xs font-semibold text-[#3A2268] sm:text-sm">
            {listingCount} {listingCount === 1 ? 'listing' : 'listings'} shown
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-md ring-1 ring-gray-100">
        <MetroMapSnapshot
          pins={pins}
          viewport={viewport}
          className="h-56 w-full overflow-hidden bg-slate-100 sm:h-72 lg:h-80"
        />
      </div>
    </section>
  )
}
