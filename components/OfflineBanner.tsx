/**
 * Offline banner component
 * Shows when using cached data due to network issues
 */

interface OfflineBannerProps {
  isVisible: boolean
  isOffline: boolean
  cachedCount?: number
}

export default function OfflineBanner({ isVisible, isOffline, cachedCount }: OfflineBannerProps) {
  if (!isVisible) return null

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded-lg shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium">
            {isOffline ? 'Offline' : 'Using cached data'}
            {cachedCount && ` (${cachedCount} markers)`}
          </span>
        </div>
      </div>
    </div>
  )
}
