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
            className="inline-flex items-center gap-2 rounded-full bg-aura-gold text-aura-navy px-5 py-2.5 text-sm font-medium hover:bg-[#d39a2f] transition-colors focus:outline-none focus:ring-2 focus:ring-aura-gold focus:ring-offset-2"
          >
            Open the map
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="relative rounded-2xl border border-aura-navy/10 bg-aura-cream h-64 lg:h-72 overflow-hidden">
          {/* Fake map background */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(58, 34, 104, 0.1) 1px, transparent 1px), radial-gradient(circle at 60% 50%, rgba(58, 34, 104, 0.1) 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(58, 34, 104, 0.1) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
          </div>
          
          {/* Fake pins */}
          <div className="absolute top-[30%] left-[20%] w-4 h-4 bg-aura-navy rounded-full border-2 border-white" />
          <div className="absolute top-[50%] left-[60%] w-4 h-4 bg-aura-navy rounded-full border-2 border-white" />
          <div className="absolute top-[70%] left-[80%] w-4 h-4 bg-aura-navy rounded-full border-2 border-white" />
          
          {/* Floating card */}
          <div className="absolute bottom-4 left-4 right-4 bg-white rounded-lg shadow-lg border border-aura-navy/10 p-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-16 h-16 bg-aura-cream rounded border border-aura-navy/10" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-aura-navy truncate">Weekend Yard Sale</h3>
                <p className="text-xs text-aura-navy/60 mt-1">123 Main St, Louisville</p>
                <p className="text-xs text-aura-gold font-medium mt-1">This Saturday 9AM-3PM</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

