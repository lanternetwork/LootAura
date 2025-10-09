"use client"
export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-b from-amber-50 to-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
              LootAura
            </h1>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Discover nearby yard sales and post your own. Find deals, declutter fast, and connect with local buyers.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/sales"
                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-6 py-3 text-white font-semibold hover:bg-amber-600 transition"
              >
                Browse Sales
              </a>
              <a
                href="/sell/new"
                className="inline-flex items-center justify-center rounded-lg border border-amber-500 px-6 py-3 text-amber-700 bg-white font-semibold hover:bg-amber-50 transition"
              >
                Post Your Sale
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900">Find Sales Near You</h2>
            <p className="mt-2 text-gray-600">Explore listings with photos, details, and maps. Filter by distance and category.</p>
            <a href="/sales" className="mt-4 inline-block text-amber-700 font-medium hover:underline">Start browsing →</a>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900">Post Your Sale</h2>
            <p className="mt-2 text-gray-600">Create a listing with images and attract local buyers. It only takes a minute.</p>
            <a href="/sell/new" className="mt-4 inline-block text-amber-700 font-medium hover:underline">Create a listing →</a>
          </div>
        </div>
      </section>
    </div>
  )
}
