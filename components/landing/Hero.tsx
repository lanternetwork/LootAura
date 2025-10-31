import { HeroSearchBar } from './HeroSearchBar'

export function Hero() {
  return (
    <section className="bg-gradient-to-b from-[#FFF8E7] to-[#F9F4E9]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left column */}
          <div className="space-y-4">
            <p className="inline-block rounded-full bg-white/60 px-4 py-1 text-xs font-medium text-[#3A2268]/70">
              New · Map-first yard sale finder
            </p>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight text-[#3A2268]">
              Find local yard sales on the map.
            </h1>
            <p className="text-base md:text-lg text-[#3A2268]/70">
              Search by ZIP, date, and category. Host your own in minutes.
            </p>
            <HeroSearchBar />
          </div>

          {/* Right column - desktop only */}
          <div className="hidden lg:block">
            <div className="bg-white/70 backdrop-blur rounded-2xl border border-white/40 p-4">
              <p className="text-sm text-[#3A2268]/70 mb-2">This weekend near</p>
              <p className="text-lg font-semibold text-[#3A2268] mb-3">Louisville, KY</p>
              <p className="text-base text-[#3A2268]">12 active sales</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

