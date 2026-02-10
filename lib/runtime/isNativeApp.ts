/**
 * Runtime detection for LootAura native app WebView context
 * 
 * Provides a centralized, type-safe way to detect if code is running
 * inside the LootAura Expo app's WebView.
 * 
 * Detection methods (in priority order):
 * 1. window.ReactNativeWebView exists (authoritative - checked first)
 * 2. window.__LOOTAURA_IN_APP === true (fallback if bridge not yet available)
 * 
 * The React Native WebView bridge presence is the authoritative signal that
 * the code is running inside a native WebView. If it exists (truthy), return true immediately.
 * 
 * @returns {boolean} true if running in native app WebView, false otherwise
 */
export function isNativeApp(): boolean {
  // SSR-safe: always return false during server-side rendering
  if (typeof window === 'undefined') {
    return false
  }

  // Use type assertion to access the property (TypeScript global augmentation)
  const win = window as Window & { 
    __LOOTAURA_IN_APP?: boolean;
    ReactNativeWebView?: { postMessage: (message: string) => void } | null;
  }

  // Authoritative detection: React Native WebView bridge presence
  // If window.ReactNativeWebView exists (truthy), return true immediately
  // This is the most reliable and authoritative signal for native WebView context
  if (win.ReactNativeWebView) {
    return true
  }

  // Fallback detection: explicit in-app flag (set before content loads)
  // Only checked if bridge is not present
  if (win.__LOOTAURA_IN_APP === true) {
    return true
  }

  return false
}
