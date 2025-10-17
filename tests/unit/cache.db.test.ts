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
  SCHEMA_VERSION,
  CACHE_TTL_MS
} from '@/lib/cache/db'

// Mock Dexie for testing
vi.mock('dexie', () => {
  const mockDB = {
    markersByTile: {
      get: vi.fn(),
      put: vi.fn(),
      where: vi.fn().mockReturnValue({
        below: vi.fn().mockReturnValue({
          delete: vi.fn()
        })
      }),
      clear: vi.fn(),
      count: vi.fn(),
      toArray: vi.fn()
    },
    metadata: {
      put: vi.fn(),
      clear: vi.fn()
    }
  }
  
  return {
    default: vi.fn().mockImplementation(() => mockDB),
    Table: vi.fn()
  }
})

describe('Cache DB', () => {
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

    // Mock the database get method
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.get).mockResolvedValue(mockCached)

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toEqual(mockMarkers)
    expect(mockDB.markersByTile.get).toHaveBeenCalledWith('tile1:hash1')
  })

  it('should return null when no cached data', async () => {
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.get).mockResolvedValue(null)

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

    // Mock the database methods
    const mockGet = vi.fn().mockResolvedValue(expiredCached)
    const mockDelete = vi.fn().mockResolvedValue(undefined)
    
    // Mock the getDB function to return our mock
    vi.doMock('@/lib/cache/db', async () => {
      const actual = await vi.importActual('@/lib/cache/db')
      return {
        ...actual,
        getDB: () => ({
          markersByTile: {
            get: mockGet,
            delete: mockDelete
          }
        })
      }
    })

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toBeNull()
    expect(mockDelete).toHaveBeenCalledWith('tile1:hash1')
  })

  it('should store markers in cache', async () => {
    const markers = [{ id: '1', lat: 38.2527, lng: -85.7585 }]
    
    // Mock the database methods
    const mockPut = vi.fn().mockResolvedValue(undefined)
    
    // Mock the getDB function to return our mock
    vi.doMock('@/lib/cache/db', async () => {
      const actual = await vi.importActual('@/lib/cache/db')
      return {
        ...actual,
        getDB: () => ({
          markersByTile: {
            put: mockPut
          }
        })
      }
    })

    await putCachedMarkers('tile1', 'hash1', markers)
    
    expect(mockPut).toHaveBeenCalledWith({
      id: 'tile1:hash1',
      tileId: 'tile1',
      filterHash: 'hash1',
      markers,
      timestamp: expect.any(Number),
      ttl: CACHE_TTL_MS
    })
  })

  it('should prune old cache entries', async () => {
    // Mock the database methods
    const mockWhere = vi.fn().mockReturnValue({
      below: vi.fn().mockReturnValue({
        delete: vi.fn().mockResolvedValue(undefined)
      })
    })
    const mockPut = vi.fn().mockResolvedValue(undefined)
    
    // Mock the getDB function to return our mock
    vi.doMock('@/lib/cache/db', async () => {
      const actual = await vi.importActual('@/lib/cache/db')
      return {
        ...actual,
        getDB: () => ({
          markersByTile: {
            where: mockWhere
          },
          metadata: {
            put: mockPut
          }
        })
      }
    })

    await pruneCache()
    
    expect(mockWhere).toHaveBeenCalledWith('timestamp')
    expect(mockPut).toHaveBeenCalledWith({
      id: 'lastPrune',
      schemaVersion: SCHEMA_VERSION,
      lastPrune: expect.any(Number)
    })
  })

  it('should clear all cache data', async () => {
    // Mock the database methods
    const mockClear = vi.fn().mockResolvedValue(undefined)
    
    // Mock the getDB function to return our mock
    vi.doMock('@/lib/cache/db', async () => {
      const actual = await vi.importActual('@/lib/cache/db')
      return {
        ...actual,
        getDB: () => ({
          markersByTile: {
            clear: mockClear
          },
          metadata: {
            clear: mockClear
          }
        })
      }
    })

    await clearCache()
    
    expect(mockClear).toHaveBeenCalledTimes(2)
  })

  it('should get cache statistics', async () => {
    const mockEntries = [
      { markers: [{ id: '1' }] },
      { markers: [{ id: '2' }] }
    ]

    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.count).mockResolvedValue(2)
    vi.mocked(mockDB.markersByTile.toArray).mockResolvedValue(mockEntries)

    const stats = await getCacheStats()
    
    expect(stats).toEqual({
      count: 2,
      size: expect.any(Number)
    })
  })

  it('should handle database errors gracefully', async () => {
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.get).mockRejectedValue(new Error('DB Error'))

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toBeNull()
  })
})
