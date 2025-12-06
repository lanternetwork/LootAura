'use client'

interface MobileRecenterButtonProps {
  visible: boolean
  onClick: () => void
}

/**
 * Mobile-only "Recenter Map" button that appears when user location is outside viewport
 */
export default function MobileRecenterButton({ visible, onClick }: MobileRecenterButtonProps) {
  if (!visible) return null

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="md:hidden absolute bottom-32 right-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full px-4 py-3 min-w-[48px] min-h-[48px] flex items-center justify-center gap-2 transition-colors"
      aria-label="Recenter Map"
    >
      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span className="text-sm font-medium text-gray-700">Recenter Map</span>
    </button>
  )
}

