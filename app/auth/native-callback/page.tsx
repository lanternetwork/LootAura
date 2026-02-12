'use client'

import { useSearchParams } from 'next/navigation'

/**
 * Web fallback page for /auth/native-callback
 * 
 * This page appears when Android App Links doesn't open the app
 * (e.g., in web browsers, or if App Links verification fails).
 * It provides an Android intent URL button to manually open the app,
 * ensuring OAuth can complete in the WebView session where PKCE verifier exists.
 */
export default function NativeCallbackPage() {
  const searchParams = useSearchParams()
  
  // Build query string from all search params (preserve OAuth code, state, etc.)
  const queryString = searchParams.toString()
  const callbackPath = `/auth/native-callback${queryString ? `?${queryString}` : ''}`
  
  // Android intent URL format:
  // intent://host/path?query#Intent;scheme=https;package=com.lootaura.app;end
  const intentUrl = `intent://lootaura.com${callbackPath}#Intent;scheme=https;package=com.lootaura.app;end`
  
  // Desktop-only fallback (will PKCE-fail on mobile, but useful for desktop testing)
  const browserFallbackUrl = `/auth/callback${queryString ? `?${queryString}` : ''}`
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Continue in LootAura
          </h1>
          <p className="text-gray-600 mb-6">
            Complete sign-in in the LootAura app to finish authentication.
          </p>
          <div className="space-y-3">
            <a
              href={intentUrl}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors inline-block font-medium"
            >
              Open LootAura App
            </a>
            <p className="text-xs text-gray-500 mt-4">
              Desktop-only fallback (may not work on mobile):
            </p>
            <a
              href={browserFallbackUrl}
              className="w-full bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors inline-block text-sm"
            >
              Continue in browser instead
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
