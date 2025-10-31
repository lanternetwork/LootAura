import Link from 'next/link'

export function CoreFlowsSection() {
  return (
    <section className="py-12 bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
        <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268] mb-6">
          What do you want to do today?
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {/* Browse sales card */}
          <Link
            href="/sales"
            className="bg-white rounded-2xl border border-[#3A2268]/10 hover:shadow-sm transition p-5 text-[#3A2268] group"
          >
            <div className="text-3xl mb-3">📍</div>
            <h3 className="text-lg font-semibold mb-2">Browse sales on the map</h3>
            <p className="text-sm text-[#3A2268]/70 mb-3">
              Explore yard sales near you with an interactive map view.
            </p>
            <span className="text-sm font-medium text-[#3A2268] group-hover:underline inline-flex items-center gap-1">
              Browse sales →
            </span>
          </Link>

          {/* Post your sale card */}
          <Link
            href="/sell/new"
            className="bg-white rounded-2xl border border-[#3A2268]/10 hover:shadow-sm transition p-5 text-[#3A2268] group"
          >
            <div className="text-3xl mb-3">🏷️</div>
            <h3 className="text-lg font-semibold mb-2">Post your sale</h3>
            <p className="text-sm text-[#3A2268]/70 mb-3">
              List your yard sale and reach local buyers in minutes.
            </p>
            <span className="text-sm font-medium text-[#3A2268] group-hover:underline inline-flex items-center gap-1">
              Post your sale →
            </span>
          </Link>

          {/* How it works card */}
          <Link
            href="/about"
            className="bg-white rounded-2xl border border-[#3A2268]/10 hover:shadow-sm transition p-5 text-[#3A2268] group"
          >
            <div className="text-3xl mb-3">❓</div>
            <h3 className="text-lg font-semibold mb-2">How it works</h3>
            <p className="text-sm text-[#3A2268]/70 mb-3">
              Learn how to find great deals and host your own sale.
            </p>
            <span className="text-sm font-medium text-[#3A2268] group-hover:underline inline-flex items-center gap-1">
              How it works →
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}

