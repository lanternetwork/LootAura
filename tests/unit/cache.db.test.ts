/**
 * Unit tests for IndexedDB cache functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Dexie before importing the module
vi.mock('dexie', () => {
  const mockTable = {
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
  }

  const mockDB = {
    markersByTile: mockTable,
    metadata: mockTable
  }

  return {
    default: vi.fn().mockImplementation(() => mockDB)
  }
})

// Import after mocking
import { 
  getCachedMarkers, 
  putCachedMarkers, 
  pruneCache, 
  clearCache, 
  getCacheStats,
  CACHE_TTL_MS
} from '@/lib/cache/db'

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

    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.get).mockResolvedValue(expiredCached)
    vi.mocked(mockDB.markersByTile.delete).mockResolvedValue(undefined)

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toBeNull()
    expect(mockDB.markersByTile.delete).toHaveBeenCalledWith('tile1:hash1')
  })

  it('should store markers in cache', async () => {
    const markers = [{ id: '1', lat: 38.2527, lng: -85.7585 }]
    
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.put).mockResolvedValue(undefined)

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
    const mockWhere = {
      below: vi.fn().mockReturnValue({
        delete: vi.fn().mockResolvedValue(1)
      })
    }
    
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.where).mockReturnValue(mockWhere)
    vi.mocked(mockDB.metadata.put).mockResolvedValue(undefined)

    await pruneCache()
    
    expect(mockDB.markersByTile.where).toHaveBeenCalledWith('timestamp')
    expect(mockWhere.below).toHaveBeenCalled()
    expect(mockDB.metadata.put).toHaveBeenCalled()
  })

  it('should clear all cache data', async () => {
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.clear).mockResolvedValue(undefined)
    vi.mocked(mockDB.metadata.clear).mockResolvedValue(undefined)

    await clearCache()
    
    expect(mockDB.markersByTile.clear).toHaveBeenCalled()
    expect(mockDB.metadata.clear).toHaveBeenCalled()
  })

  it('should get cache statistics', async () => {
    const mockEntries = [
      { id: '1', markers: [{ id: '1' }] },
      { id: '2', markers: [{ id: '2' }] }
    ]
    
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.count).mockResolvedValue(2)
    vi.mocked(mockDB.markersByTile.toArray).mockResolvedValue(mockEntries)

    const stats = await getCacheStats()
    
    expect(stats.count).toBe(2)
    expect(stats.size).toBeGreaterThan(0)
  })

  it('should handle database errors gracefully', async () => {
    const { default: Dexie } = await import('dexie')
    const mockDB = new Dexie()
    vi.mocked(mockDB.markersByTile.get).mockRejectedValue(new Error('Database error'))

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toBeNull()
  })
})