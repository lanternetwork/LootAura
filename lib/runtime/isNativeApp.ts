/**
 * Runtime detection for LootAura native app WebView context
 * 
 * Provides a centralized, type-safe way to detect if code is running
 * inside the LootAura Expo app's WebView.
 * 
 * Detection methods (in priority order):
 * 1. window.__LOOTAURA_IN_APP === true (primary contract, set before content loads)
 * 2. window.ReactNativeWebView exists (fallback for compatibility)
 * 
 * @returns {boolean} true if running in native app WebView, false otherwise
 */
export function isNativeApp(): boolean {
  // SSR: always return false during server-side rendering
  if (typeof window === 'undefined') {
    return false
  }

  // Primary detection: explicit in-app flag (set before content loads)
  if (window.__LOOTAURA_IN_APP === true) {
    return true
  }

  // Fallback detection: React Native WebView bridge (best-effort)
  if (typeof window.ReactNativeWebView !== 'undefined' && 
      window.ReactNativeWebView !== null) {
    return true
  }

  return false
}
