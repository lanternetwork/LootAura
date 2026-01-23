/**
 * Feature flags for controlled rollout
 */

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
 * Check if test/demo sales are enabled
 * Browser-safe and server-safe
 * Prioritizes NEXT_PUBLIC_ENABLE_TEST_SALES over ENABLE_TEST_SALES
 */
export function isTestSalesEnabled(): boolean {
  // Check NEXT_PUBLIC first (client-side flag)
  if (process.env.NEXT_PUBLIC_ENABLE_TEST_SALES !== undefined) {
    return process.env.NEXT_PUBLIC_ENABLE_TEST_SALES === 'true'
  }
  // Fall back to server-side flag
  return process.env.ENABLE_TEST_SALES === 'true'
}