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
import 'fake-indexeddb/auto'

// Mock the getDB function to return a mock database
vi.mock('@/lib/cache/db', async () => {
  const actual = await vi.importActual('@/lib/cache/db')
  return {
    ...actual,
    getDB: vi.fn(() => ({
      markersByTile: {
        get: vi.fn(),
        put: vi.fn(),
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
    }))
  }
})

describe('Cache Database', () => {
  let mockDB: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const { getDB } = await import('@/lib/cache/db')
    mockDB = getDB()
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
    mockDB.markersByTile.delete = vi.fn().mockResolvedValue(undefined)

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
    const mockWhere = vi.fn().mockReturnValue({
      below: vi.fn().mockReturnValue({
        delete: vi.fn().mockResolvedValue(undefined)
      })
    })
    mockDB.markersByTile.where = mockWhere
    mockDB.metadata.put.mockResolvedValue(undefined)

    await pruneCache()
    
    expect(mockDB.markersByTile.where).toHaveBeenCalledWith('timestamp')
    expect(mockDB.metadata.put).toHaveBeenCalledWith({
      id: 'lastPrune',
      schemaVersion: expect.any(String),
      lastPrune: expect.any(Number)
    })
  })

  it('should clear all cache data', async () => {
    mockDB.markersByTile.clear.mockResolvedValue(undefined)
    mockDB.metadata.clear.mockResolvedValue(undefined)

    await clearCache()
    
    expect(mockDB.markersByTile.clear).toHaveBeenCalled()
    expect(mockDB.metadata.clear).toHaveBeenCalled()
  })

  it('should get cache statistics', async () => {
    const mockEntries = [
      { markers: [{ id: '1' }] },
      { markers: [{ id: '2' }] }
    ]
    
    mockDB.markersByTile.count.mockResolvedValue(2)
    mockDB.markersByTile.toArray.mockResolvedValue(mockEntries)

    const stats = await getCacheStats()
    
    expect(stats).toEqual({ count: 2, size: expect.any(Number) })
    expect(mockDB.markersByTile.count).toHaveBeenCalled()
    expect(mockDB.markersByTile.toArray).toHaveBeenCalled()
  })
})