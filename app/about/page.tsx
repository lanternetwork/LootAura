import Link from 'next/link'
import { TopNav } from '@/components/landing/TopNav'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      
      {/* Hero Section - matching landing page */}
      <section className="bg-gradient-to-b from-[#FFF8E7] to-[#F9F4E9]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-16">
          <div className="text-center space-y-4">
            <p className="inline-block rounded-full bg-white/60 px-4 py-1 text-xs font-medium text-[#3A2268]/70">
              Simple · Fast · Local
            </p>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight text-[#3A2268]">
              How it works
            </h1>
            <p className="text-base md:text-lg text-[#3A2268]/70 max-w-2xl mx-auto">
              Find great deals at yard sales near you, or host your own sale in just a few minutes.
            </p>
          </div>
        </div>
      </section>

      {/* For Buyers Section */}
      <section className="py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268] mb-8 text-center">
            For Buyers
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl border border-[#3A2268]/10 p-6">
              <div className="text-3xl mb-4">📍</div>
              <div className="inline-block rounded-full bg-[#F4B63A]/20 text-[#3A2268] text-xs font-medium px-3 py-1 mb-3">
                Step 1
              </div>
              <h3 className="text-lg font-semibold text-[#3A2268] mb-2">Search by location</h3>
              <p className="text-sm text-[#3A2268]/70">
                Enter your ZIP code or let us use your location to find yard sales near you.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl border border-[#3A2268]/10 p-6">
              <div className="text-3xl mb-4">🗺️</div>
              <div className="inline-block rounded-full bg-[#F4B63A]/20 text-[#3A2268] text-xs font-medium px-3 py-1 mb-3">
                Step 2
              </div>
              <h3 className="text-lg font-semibold text-[#3A2268] mb-2">Browse on the map</h3>
              <p className="text-sm text-[#3A2268]/70">
                Explore sales on an interactive map. Filter by date, category, and distance.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl border border-[#3A2268]/10 p-6">
              <div className="text-3xl mb-4">🛍️</div>
              <div className="inline-block rounded-full bg-[#F4B63A]/20 text-[#3A2268] text-xs font-medium px-3 py-1 mb-3">
                Step 3
              </div>
              <h3 className="text-lg font-semibold text-[#3A2268] mb-2">Find great deals</h3>
              <p className="text-sm text-[#3A2268]/70">
                View sale details, see photos, and get directions. No account needed to browse.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* For Sellers Section */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268] mb-8 text-center">
            For Sellers
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl border border-[#3A2268]/10 p-6">
              <div className="text-3xl mb-4">✍️</div>
              <div className="inline-block rounded-full bg-[#F4B63A]/20 text-[#3A2268] text-xs font-medium px-3 py-1 mb-3">
                Step 1
              </div>
              <h3 className="text-lg font-semibold text-[#3A2268] mb-2">Create your listing</h3>
              <p className="text-sm text-[#3A2268]/70">
                Add your sale details, photos, address, and date. It takes just a few minutes.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl border border-[#3A2268]/10 p-6">
              <div className="text-3xl mb-4">📸</div>
              <div className="inline-block rounded-full bg-[#F4B63A]/20 text-[#3A2268] text-xs font-medium px-3 py-1 mb-3">
                Step 2
              </div>
              <h3 className="text-lg font-semibold text-[#3A2268] mb-2">Upload photos</h3>
              <p className="text-sm text-[#3A2268]/70">
                Show off your items with photos. Buyers love seeing what&apos;s for sale.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl border border-[#3A2268]/10 p-6">
              <div className="text-3xl mb-4">👥</div>
              <div className="inline-block rounded-full bg-[#F4B63A]/20 text-[#3A2268] text-xs font-medium px-3 py-1 mb-3">
                Step 3
              </div>
              <h3 className="text-lg font-semibold text-[#3A2268] mb-2">Get discovered</h3>
              <p className="text-sm text-[#3A2268]/70">
                Your sale appears on the map for local buyers to find. Free to list.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268] mb-8 text-center">
            Why use Loot Aura?
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <div className="text-3xl mb-3">🗺️</div>
              <h3 className="text-base font-semibold text-[#3A2268] mb-2">Map-first search</h3>
              <p className="text-sm text-[#3A2268]/70">
                See all sales in your area on an interactive map
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">📅</div>
              <h3 className="text-base font-semibold text-[#3A2268] mb-2">Filter by date</h3>
              <p className="text-sm text-[#3A2268]/70">
                Find sales happening today, this weekend, or any date
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">🏷️</div>
              <h3 className="text-base font-semibold text-[#3A2268] mb-2">Category filters</h3>
              <p className="text-sm text-[#3A2268]/70">
                Search for furniture, electronics, clothing, and more
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">🆓</div>
              <h3 className="text-base font-semibold text-[#3A2268] mb-2">Free to use</h3>
              <p className="text-sm text-[#3A2268]/70">
                Browse and list your sales for free
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 bg-gradient-to-b from-[#FFF8E7] to-[#F9F4E9]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
            Ready to get started?
          </h2>
          <p className="text-base text-[#3A2268]/70 max-w-2xl mx-auto">
            Browse local yard sales or list your own sale today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/sales"
              className="px-6 py-3 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium rounded-lg transition-colors"
            >
              Browse sales →
            </Link>
            <Link
              href="/sell/new"
              className="px-6 py-3 bg-white hover:bg-gray-50 text-[#3A2268] font-medium rounded-lg border border-[#3A2268]/10 transition-colors"
            >
              Post your sale →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

