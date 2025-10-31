import Link from 'next/link'

export function LandingCta() {
  return (
    <section className="bg-[#3A2268] text-white py-10 md:py-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 text-center">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold mb-4">
          Ready to find your next great deal?
        </h2>
        <p className="text-base md:text-lg text-white/80 mb-6 max-w-2xl mx-auto">
          Discover local yard sales, garage sales, and estate sales in your area. Never miss a great find again.
        </p>
        <Link
          href="/sales"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-semibold rounded-lg transition-colors text-base"
        >
          Browse Sales
        </Link>
      </div>
    </section>
  )
}

