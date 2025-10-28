/**
 * Stable filter hashing for cache keys
 * Ensures consistent cache keys for semantically equivalent filter states
 */

export interface FilterState {
  dateRange: string
  categories: string[]
  radius: number
}

/**
 * Create a stable hash for filter state
 * Normalizes the input to ensure consistent hashing
 */
export function hashFilters(filters: FilterState): string {
  // Normalize the filter state
  const normalized = {
    dateRange: filters.dateRange,
    categories: [...filters.categories].sort(), // Sort for consistency
    radius: filters.radius
  }
  
  // Create a stable string representation
  const str = JSON.stringify(normalized)
  
  // Simple hash function (for deterministic results in tests)
  return simpleHash(str)
}

/**
 * Simple hash function for deterministic results
 * Uses djb2 algorithm for good distribution
 */
function simpleHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Check if two filter states are equivalent
 */
export function filtersEqual(a: FilterState, b: FilterState): boolean {
  return hashFilters(a) === hashFilters(b)
}

/**
 * Create cache key from tile ID and filter hash
 */
export function createCacheKey(tileId: string, filterHash: string): string {
  return `${tileId}:${filterHash}`
}
