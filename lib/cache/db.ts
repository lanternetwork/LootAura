/**
 * IndexedDB cache using Dexie for offline map data
 */

import Dexie, { type Table } from 'dexie'

export interface CachedMarkers {
  id: string
  tileId: string
  filterHash: string
  markers: any[]
  timestamp: number
  ttl: number
}

export interface CacheMetadata {
  id: string
  schemaVersion: string
  lastPrune: number
}

export class MapCacheDB extends Dexie {
  markersByTile!: Table<CachedMarkers>
  metadata!: Table<CacheMetadata>

  constructor() {
    super('MapCacheDB')
    this.version(1).stores({
      markersByTile: 'id, tileId, filterHash, timestamp',
      metadata: 'id'
    })
  }
}

export const SCHEMA_VERSION = '1.0.0'
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

let db: MapCacheDB | null = null

/**
 * Get or create the database instance
 */
export function getDB(): MapCacheDB {
  if (!db) {
    db = new MapCacheDB()
  }
  return db
}

/**
 * Get cached markers for a tile and filter combination
 */
export async function getCachedMarkers(tileId: string, filterHash: string): Promise<any[] | null> {
  try {
    const database = getDB()
    const cacheKey = `${tileId}:${filterHash}`
    
    const cached = await database.markersByTile.get(cacheKey)
    if (!cached) return null
    
    // Check if cache entry is expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      await database.markersByTile.delete(cacheKey)
      return null
    }
    
    return cached.markers
  } catch (error) {
    console.warn('[CACHE] Failed to get cached markers:', error)
    return null
  }
}

/**
 * Store markers in cache
 */
export async function putCachedMarkers(
  tileId: string, 
  filterHash: string, 
  markers: any[], 
  ttl: number = CACHE_TTL_MS
): Promise<void> {
  try {
    const database = getDB()
    const cacheKey = `${tileId}:${filterHash}`
    
    await database.markersByTile.put({
      id: cacheKey,
      tileId,
      filterHash,
      markers,
      timestamp: Date.now(),
      ttl
    })
  } catch (error) {
    console.warn('[CACHE] Failed to store markers:', error)
  }
}

/**
 * Prune old cache entries
 */
export async function pruneCache(): Promise<void> {
  try {
    const database = getDB()
    const cutoff = Date.now() - CACHE_TTL_MS
    
    await database.markersByTile.where('timestamp').below(cutoff).delete()
    
    // Update last prune timestamp
    await database.metadata.put({
      id: 'lastPrune',
      schemaVersion: SCHEMA_VERSION,
      lastPrune: Date.now()
    })
  } catch (error) {
    console.warn('[CACHE] Failed to prune cache:', error)
  }
}

/**
 * Clear all cache data
 */
export async function clearCache(): Promise<void> {
  try {
    const database = getDB()
    await database.markersByTile.clear()
    await database.metadata.clear()
  } catch (error) {
    console.warn('[CACHE] Failed to clear cache:', error)
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ count: number; size: number }> {
  try {
    const database = getDB()
    const count = await database.markersByTile.count()
    
    // Estimate size (rough calculation)
    const allEntries = await database.markersByTile.toArray()
    const size = allEntries.reduce((total, entry) => {
      return total + JSON.stringify(entry).length
    }, 0)
    
    return { count, size }
  } catch (error) {
    console.warn('[CACHE] Failed to get cache stats:', error)
    return { count: 0, size: 0 }
  }
}
