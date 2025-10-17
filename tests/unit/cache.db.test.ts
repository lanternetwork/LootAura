/**
 * Unit tests for IndexedDB cache functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  getCachedMarkers, 
  putCachedMarkers, 
  pruneCache, 
  clearCache, 
  getCacheStats,
  CACHE_TTL_MS
} from '@/lib/cache/db'

// Mock Dexie for testing
const mockDB = {
  markersByTile: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    where: vi.fn().mockReturnValue({
      below: vi.fn().mockReturnValue({
        delete: vi.fn()
      })
    }),
    clear: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    toArray: vi.fn().mockResolvedValue([])
  },
  metadata: {
    put: vi.fn(),
    clear: vi.fn()
  }
}

vi.mock('@/lib/cache/db', async () => {
  const actual = await vi.importActual('@/lib/cache/db')
  return {
    ...actual,
    getDB: () => mockDB
  }
})

describe('Cache Database', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should get cached markers when available', async () => {
    const mockMarkers = [{ id: '1', lat: 38.2527, lng: -85.7585 }]
    const mockCached = {
      id: 'tile1:hash1',
      tileId: 'tile1',
      filterHash: 'hash1',
      markers: mockMarkers,
      timestamp: Date.now(),
      ttl: CACHE_TTL_MS
    }

    mockDB.markersByTile.get.mockResolvedValue(mockCached)

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toEqual(mockMarkers)
    expect(mockDB.markersByTile.get).toHaveBeenCalledWith('tile1:hash1')
  })

  it('should return null when no cached data', async () => {
    mockDB.markersByTile.get.mockResolvedValue(null)

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toBeNull()
  })

  it('should return null for expired cache entries', async () => {
    const expiredCached = {
      id: 'tile1:hash1',
      tileId: 'tile1',
      filterHash: 'hash1',
      markers: [{ id: '1' }],
      timestamp: Date.now() - (CACHE_TTL_MS + 1000), // Expired
      ttl: CACHE_TTL_MS
    }

    mockDB.markersByTile.get.mockResolvedValue(expiredCached)
    mockDB.markersByTile.delete.mockResolvedValue(undefined)

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toBeNull()
    expect(mockDB.markersByTile.delete).toHaveBeenCalledWith('tile1:hash1')
  })

  it('should store markers in cache', async () => {
    const markers = [{ id: '1', lat: 38.2527, lng: -85.7585 }]
    
    mockDB.markersByTile.put.mockResolvedValue(undefined)

    await putCachedMarkers('tile1', 'hash1', markers)
    
    expect(mockDB.markersByTile.put).toHaveBeenCalledWith({
      id: 'tile1:hash1',
      tileId: 'tile1',
      filterHash: 'hash1',
      markers,
      timestamp: expect.any(Number),
      ttl: CACHE_TTL_MS
    })
  })

  it('should prune old cache entries', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined)
    mockDB.markersByTile.where.mockReturnValue({
      below: vi.fn().mockReturnValue({
        delete: mockDelete
      })
    })
    mockDB.metadata.put.mockResolvedValue(undefined)

    await pruneCache()
    
    expect(mockDB.markersByTile.where).toHaveBeenCalledWith('timestamp')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDB.metadata.put).toHaveBeenCalled()
  })

  it('should clear all cache data', async () => {
    mockDB.markersByTile.clear.mockResolvedValue(undefined)
    mockDB.metadata.clear.mockResolvedValue(undefined)

    await clearCache()
    
    expect(mockDB.markersByTile.clear).toHaveBeenCalled()
    expect(mockDB.metadata.clear).toHaveBeenCalled()
  })

  it('should get cache statistics', async () => {
    const mockCount = 5
    const mockEntries = [
      { markers: [{ id: '1' }] },
      { markers: [{ id: '2' }] }
    ]

    mockDB.markersByTile.count.mockResolvedValue(mockCount)
    mockDB.markersByTile.toArray.mockResolvedValue(mockEntries)

    const stats = await getCacheStats()
    
    expect(stats.count).toBe(mockCount)
    expect(stats.size).toBeGreaterThan(0)
  })
})