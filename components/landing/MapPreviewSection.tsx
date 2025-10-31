import Link from 'next/link'

export function MapPreviewSection() {
  return (
    <section className="py-12 bg-white">
      <div className="mx-auto max-w-6xl px-4 lg:px-8 grid gap-8 lg:grid-cols-2 items-center">
        <div>
          <h2 className="text-xl font-semibold text-aura-navy mb-3">Browse on the live map</h2>
          <p className="text-aura-navy/70 mb-4">
            Pan, zoom, and filter by category to see what&apos;s happening in your neighborhood.
          </p>
          <Link
            href="/sales"
            className="inline-flex items-center gap-2 rounded-full bg-aura-navy text-white px-5 py-2.5 text-sm font-medium hover:bg-aura-navy/90 transition-colors focus:outline-none focus:ring-2 focus:ring-aura-gold focus:ring-offset-2"
          >
            Open the map
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="rounded-2xl border border-aura-cream bg-aura-cream h-64 lg:h-72 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-aura-navy/40 text-sm">Map preview</p>
            <Link href="/sales" className="text-aura-gold hover:text-[#d39a2f] font-medium text-sm">
              Explore the map →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

