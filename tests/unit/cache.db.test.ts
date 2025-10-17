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
const mockMarkersByTile = {
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
}

const mockMetadata = {
  put: vi.fn(),
  clear: vi.fn()
}

const mockDB = {
  markersByTile: mockMarkersByTile,
  metadata: mockMetadata
}

vi.mock('dexie', () => ({
  default: vi.fn().mockImplementation(() => mockDB)
}))

// Mock the getDB function
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

    mockMarkersByTile.get.mockResolvedValue(mockCached)

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toEqual(mockMarkers)
    expect(mockMarkersByTile.get).toHaveBeenCalledWith('tile1:hash1')
  })

  it('should return null when no cached data', async () => {
    mockMarkersByTile.get.mockResolvedValue(null)

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

    mockMarkersByTile.get.mockResolvedValue(expiredCached)
    mockMarkersByTile.delete.mockResolvedValue(undefined)

    const result = await getCachedMarkers('tile1', 'hash1')
    
    expect(result).toBeNull()
    expect(mockMarkersByTile.delete).toHaveBeenCalledWith('tile1:hash1')
  })

  it('should store markers in cache', async () => {
    const markers = [{ id: '1', lat: 38.2527, lng: -85.7585 }]
    
    await putCachedMarkers('tile1', 'hash1', markers)
    
    expect(mockMarkersByTile.put).toHaveBeenCalledWith({
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
    mockMarkersByTile.where.mockReturnValue({
      below: vi.fn().mockReturnValue({
        delete: mockDelete
      })
    })

    await pruneCache()
    
    expect(mockMarkersByTile.where).toHaveBeenCalledWith('timestamp')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockMetadata.put).toHaveBeenCalled()
  })

  it('should clear all cache data', async () => {
    await clearCache()
    
    expect(mockMarkersByTile.clear).toHaveBeenCalled()
    expect(mockMetadata.clear).toHaveBeenCalled()
  })

  it('should get cache statistics', async () => {
    const mockEntries = [
      { id: '1', markers: [{ id: '1' }] },
      { id: '2', markers: [{ id: '2' }] }
    ]
    
    mockMarkersByTile.count.mockResolvedValue(2)
    mockMarkersByTile.toArray.mockResolvedValue(mockEntries)

    const stats = await getCacheStats()
    
    expect(stats).toEqual({ count: 2, size: expect.any(Number) })
    expect(mockMarkersByTile.count).toHaveBeenCalled()
    expect(mockMarkersByTile.toArray).toHaveBeenCalled()
  })
})