'use client'

interface UseMyLocationButtonProps {
  onClick: () => void
  loading?: boolean
}

/**
 * "Use my location" CTA button for mobile/tablet.
 * Visible only when browser geolocation permission has not been granted yet.
 */
export default function UseMyLocationButton({ onClick, loading = false }: UseMyLocationButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={loading}
      className="lg:hidden absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-lg px-4 py-3 min-w-[200px] flex flex-col items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-[110]"
      aria-label="Use my location"
    >
      {loading ? (
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-700 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-medium text-gray-700">Requesting...</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Use my location</span>
          </div>
          <span className="text-xs text-gray-500">Shows sales near you</span>
        </>
      )}
    </button>
  )
}

