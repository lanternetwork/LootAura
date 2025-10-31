'use client'
import { useRouter } from 'next/navigation'
import { HeroSearchBar } from './HeroSearchBar'

export function HeroSection() {
  const router = useRouter()

  return (
    <section className="relative overflow-hidden py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 lg:px-8 grid gap-10 lg:grid-cols-[1.05fr_.95fr] items-center">
        <div className="space-y-6">
          <p className="inline-block rounded-full bg-white/60 px-4 py-1 text-xs font-medium text-aura-navy ring-1 ring-black/5">
            New • Map-first yard sale finder
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight text-aura-navy">
            Find local yard sales on the map.
          </h1>
          <p className="text-base md:text-lg text-aura-navy/70 max-w-xl">
            Search by ZIP, date, and categories. Host your own in minutes.
          </p>
          <HeroSearchBar />
          <div className="flex gap-3 items-center text-sm">
            <button
              onClick={() => router.push('/sell/new')}
              className="inline-flex items-center gap-2 text-aura-navy/70 hover:text-aura-navy transition-colors"
            >
              Post a sale →
            </button>
            <p className="text-xs text-aura-navy/40">No fees to list.</p>
          </div>
        </div>
        <div className="rounded-3xl bg-white/70 shadow-sm border border-white/40 backdrop-blur-sm min-h-[240px] p-4 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-aura-navy/60 text-sm">This weekend near</p>
            <p className="text-aura-navy font-medium text-lg">Louisville, KY</p>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 -top-32 h-64 bg-[radial-gradient(circle_at_top,rgba(244,182,58,0.25),transparent_65%)]" />
    </section>
  )
}

