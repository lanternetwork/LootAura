/**
 * Offline cache with graceful fallback
 * Handles network → write cache; network fail → read cache
 */

import { getCachedMarkers, putCachedMarkers } from './db'
import { isDebugEnabled } from '@/lib/flags'

export interface CacheOptions {
  ttlMs?: number
  tileId: string
  filterHash: string
}

/**
 * Fetch with cache fallback
 * Tries network first, falls back to cache on failure
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions
): Promise<{ data: T | null; fromCache: boolean; error?: Error }> {
  const { tileId, filterHash, ttlMs } = options
  
  try {
    // Try network first
    const data = await fetcher()
    
    // Store in cache on success
    if (data && typeof data === 'object' && 'markers' in data) {
      await putCachedMarkers(tileId, filterHash, (data as any).markers, ttlMs)
      
      if (isDebugEnabled()) {
        console.debug('[CACHE] Network success, stored in cache', { tileId, filterHash })
      }
    }
    
    return { data, fromCache: false }
  } catch (error) {
    // Network failed, try cache
    if (isDebugEnabled()) {
      console.debug('[CACHE] Network failed, checking cache', { tileId, filterHash, error })
    }
    
    const cachedData = await getCachedMarkers(tileId, filterHash)
    
    if (cachedData) {
      if (isDebugEnabled()) {
        console.debug('[CACHE] Cache hit, serving stale data', { tileId, filterHash })
      }
      
      return { 
        data: { markers: cachedData } as T, 
        fromCache: true 
      }
    }
    
    // No cache available
    if (isDebugEnabled()) {
      console.debug('[CACHE] Cache miss, no fallback available', { tileId, filterHash })
    }
    
    return { 
      data: null, 
      fromCache: false, 
      error: error as Error 
    }
  }
}

/**
 * Check if we're likely offline
 */
export function isOffline(): boolean {
  return !navigator.onLine
}

/**
 * Check if we have cached data for a tile/filter combination
 */
export async function hasCachedData(tileId: string, filterHash: string): Promise<boolean> {
  const cached = await getCachedMarkers(tileId, filterHash)
  return cached !== null
}
