/**
 * User-Agent token set by the LootAura Expo app WebView so the web app can detect
 * in-app on the very first request/render without relying on injected script timing.
 */
const IN_APP_UA_TOKEN = 'LootAuraInApp/1.0'

/**
 * Runtime detection for LootAura native app WebView context
 * 
 * Detection methods (in priority order):
 * 1. User-Agent contains IN_APP_UA_TOKEN (available on first request/render; reliable on Android)
 * 2. window.ReactNativeWebView exists (bridge from react-native-webview)
 * 3. window.__LOOTAURA_IN_APP === true (set by injectedJavaScriptBeforeContentLoaded)
 * 
 * @returns {boolean} true if running in native app WebView, false otherwise
 */
export function isNativeApp(): boolean {
  // SSR-safe: always return false during server-side rendering
  if (typeof window === 'undefined') {
    return false
  }

  // First: User-Agent token (present on first request; does not depend on injection timing)
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes(IN_APP_UA_TOKEN)) {
    return true
  }

  const win = window as Window & {
    __LOOTAURA_IN_APP?: boolean
    ReactNativeWebView?: { postMessage: (message: string) => void } | null
  }

  if (win.ReactNativeWebView) {
    return true
  }

  if (win.__LOOTAURA_IN_APP === true) {
    return true
  }

  return false
}

/** Token string for tests or logging. */
export function getInAppUaToken(): string {
  return IN_APP_UA_TOKEN
}

/**
 * Server-side (or headless) in-app detection from User-Agent string.
 * Use when only headers are available (e.g. Next.js server component).
 */
export function isInAppUserAgent(userAgent: string | null): boolean {
  if (!userAgent || typeof userAgent !== 'string') return false
  return userAgent.includes(IN_APP_UA_TOKEN)
}

/**
 * Whether in-app was detected via User-Agent token (available on first request).
 * Use for Sentry breadcrumbs to distinguish UA-based vs bridge/flag detection.
 */
export function isNativeAppViaUserAgent(): boolean {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false
  return navigator.userAgent.includes(IN_APP_UA_TOKEN)
}
