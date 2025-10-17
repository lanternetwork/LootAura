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
    default: vi.fn().mockImplementation(() => mockDB)
  }
})

describe('Cache Database', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should handle getCachedMarkers gracefully', async () => {
    const result = await getCachedMarkers('tile1', 'hash1')
    expect(result).toBeNull()
  })

  it('should handle putCachedMarkers gracefully', async () => {
    const markers = [{ id: '1', lat: 38.2527, lng: -85.7585 }]
    await expect(putCachedMarkers('tile1', 'hash1', markers)).resolves.not.toThrow()
  })

  it('should handle pruneCache gracefully', async () => {
    await expect(pruneCache()).resolves.not.toThrow()
  })

  it('should handle clearCache gracefully', async () => {
    await expect(clearCache()).resolves.not.toThrow()
  })

  it('should handle getCacheStats gracefully', async () => {
    const stats = await getCacheStats()
    expect(stats).toEqual({ count: 0, size: 0 })
  })
})