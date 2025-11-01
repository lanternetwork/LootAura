/**
 * Feature flags for controlled rollout
 */

/**
 * Check if offline cache is enabled
 */
export function isOfflineCacheEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FLAG_OFFLINE_CACHE === 'true'
}

/**
 * Check if clustering is enabled
 */
export function isClusteringEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_CLUSTERING !== 'false'
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG === 'true'
}

/**
 * Check if saved presets are enabled
 */
export function isSavedPresetsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FLAG_SAVED_PRESETS !== 'false'
}

/**
 * Check if share links are enabled
 */
export function isShareLinksEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FLAG_SHARE_LINKS !== 'false'
}

/**
 * Check if test/demo sales are enabled
 * Browser-safe and server-safe
 */
export function isTestSalesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_TEST_SALES === 'true' 
    || process.env.ENABLE_TEST_SALES === 'true'
}