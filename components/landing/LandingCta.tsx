import Link from 'next/link'

export function LandingCta() {
  return (
    <section className="py-10 bg-aura-navy text-white">
      <div className="mx-auto max-w-4xl text-center space-y-4 px-4">
        <h2 className="text-2xl font-semibold">Ready to find your next great deal?</h2>
        <p className="text-white/70">Search your area in seconds and see what&apos;s happening this weekend.</p>
        <Link
          href="/sales"
          className="inline-flex items-center gap-2 rounded-full bg-aura-gold text-aura-navy px-6 py-2.5 font-medium hover:bg-[#d39a2f] transition-colors focus:outline-none focus:ring-2 focus:ring-aura-gold focus:ring-offset-2 focus:ring-offset-aura-navy"
        >
          Browse sales →
        </Link>
      </div>
    </section>
  )
}

