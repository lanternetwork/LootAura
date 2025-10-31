import Link from 'next/link'

export function MapPreviewSection() {
  return (
    <section className="py-12 bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left column - text */}
          <div className="space-y-4">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#3A2268]">
              Browse on the live map
            </h2>
            <p className="text-base text-[#3A2268]/70">
              Pan, zoom, and filter by category to see what&apos;s happening in your neighborhood.
            </p>
            <Link
              href="/sales"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium rounded-lg transition-colors"
            >
              Open the map →
            </Link>
          </div>

          {/* Right column - map preview image */}
          <div className="rounded-2xl border border-[#3A2268]/10 bg-[#F9FFF2] p-4 overflow-hidden">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
              {/* Placeholder for map preview image */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#F9FFF2] to-[#FFF8E7]">
                <div className="text-center text-[#3A2268]/40">
                  <div className="text-4xl mb-2">🗺️</div>
                  <p className="text-sm font-medium">Map Preview</p>
                </div>
              </div>
              {/* Uncomment when image is available */}
              {/* <Image
                src="/images/landing-map-preview.png"
                alt="Map preview showing yard sales"
                fill
                className="object-cover"
              /> */}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

