'use client'

interface LocationPermissionDeniedProps {
  onDismiss?: () => void
}

/**
 * Inline message shown when user denies location access.
 * Non-blocking, friendly message that doesn't prevent map usage.
 */
export default function LocationPermissionDenied({ onDismiss }: LocationPermissionDeniedProps) {
  return (
    <div className="lg:hidden absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-auto bg-white shadow-lg rounded-lg p-4 max-w-[320px] z-[110] border border-gray-200">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Location access is turned off
          </h3>
          <p className="text-xs text-gray-600 mb-2">
            You can still explore the map manually, or enable location access anytime in your browser settings.
          </p>
          <p className="text-xs text-gray-500">
            Tip: Refresh the page after re-enabling location.
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

