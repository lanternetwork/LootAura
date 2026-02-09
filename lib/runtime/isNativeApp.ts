/**
 * Runtime detection for LootAura native app WebView context
 * 
 * Provides a centralized, type-safe way to detect if code is running
 * inside the LootAura Expo app's WebView.
 * 
 * Detection methods (in priority order):
 * 1. window.__LOOTAURA_IN_APP === true (primary contract, set before content loads)
 * 2. window.ReactNativeWebView exists (authoritative WebView bridge presence)
 * 
 * The React Native WebView bridge presence is an authoritative signal that
 * the code is running inside a native WebView, regardless of other flags.
 * 
 * @returns {boolean} true if running in native app WebView, false otherwise
 */
export function isNativeApp(): boolean {
  // SSR: always return false during server-side rendering
  if (typeof window === 'undefined') {
    return false
  }

  // Use type assertion to access the property (TypeScript global augmentation)
  const win = window as Window & { 
    __LOOTAURA_IN_APP?: boolean;
    ReactNativeWebView?: { postMessage: (message: string) => void } | null;
  }

  // Authoritative detection: React Native WebView bridge presence
  // This is the most reliable signal that we're in a native WebView
  if (typeof win.ReactNativeWebView !== 'undefined' && 
      win.ReactNativeWebView !== null) {
    return true
  }

  // Primary detection: explicit in-app flag (set before content loads)
  if (win.__LOOTAURA_IN_APP === true) {
    return true
  }

  return false
}
