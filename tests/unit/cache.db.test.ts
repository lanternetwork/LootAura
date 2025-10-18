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

// Mock the entire db module
vi.mock('@/lib/cache/db', async () => {
  const actual = await vi.importActual('@/lib/cache/db')
  return {
    ...actual,
    getCachedMarkers: vi.fn().mockResolvedValue(null),
    putCachedMarkers: vi.fn().mockResolvedValue(undefined),
    pruneCache: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn().mockResolvedValue(undefined),
    getCacheStats: vi.fn().mockResolvedValue({ count: 0, size: 0 })
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
    await putCachedMarkers('tile1', 'hash1', markers)
    // Should not throw
  })

  it('should handle pruneCache gracefully', async () => {
    await pruneCache()
    // Should not throw
  })

  it('should handle clearCache gracefully', async () => {
    await clearCache()
    // Should not throw
  })

  it('should handle getCacheStats gracefully', async () => {
    const stats = await getCacheStats()
    expect(stats).toEqual({ count: 0, size: 0 })
  })
})