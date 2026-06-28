import MetroMapSnapshot from '@/components/metro/MetroMapSnapshot'
import type { MetroMapPin, MetroMapViewport } from '@/lib/seo/metroMapViewport'

type MetroMapSectionProps = {
  pins: MetroMapPin[]
  viewport: MetroMapViewport
  heading?: string
}

export default function MetroMapSection({
  pins,
  viewport,
  heading = 'Metro map snapshot',
}: MetroMapSectionProps) {
  return (
    <section className="mt-10" aria-label={heading}>
      <h2 className="sr-only">{heading}</h2>
      <MetroMapSnapshot
        pins={pins}
        viewport={viewport}
        className="h-72 w-full overflow-hidden rounded-xl border border-gray-200 bg-slate-100 sm:h-80"
      />
    </section>
  )
}
