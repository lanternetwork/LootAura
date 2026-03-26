'use client'

import { usePWAPlatform } from '@/components/pwa/PWAPlatformProvider'

export default function PWAInstallPrompt() {
  const { showAndroidInstallCta, showIosInstallHelper, promptInstall, dismissInstallUi } = usePWAPlatform()

  if (!showAndroidInstallCta && !showIosInstallHelper) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="bg-white border-t border-gray-200 shadow-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {showAndroidInstallCta ? (
              <p className="text-sm font-medium text-gray-900">Install LootAura for quicker access</p>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-900">Add LootAura to your Home Screen</p>
                <p className="text-xs text-gray-600 mt-1">
                  In Safari, tap Share then choose Add to Home Screen.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {showAndroidInstallCta && (
              <button
                onClick={() => {
                  void promptInstall()
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors btn-accent"
              >
                Install
              </button>
            )}
            <button
              onClick={dismissInstallUi}
              className="text-gray-500 hover:text-gray-700 p-1"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
