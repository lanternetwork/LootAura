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