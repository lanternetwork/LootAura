/**
 * Unit tests for tile management functionality
 */

import { describe, it, expect } from 'vitest'
import { 
  tileIdForBounds, 
  adjacentTileIds, 
  viewportToTileBounds, 
  getCurrentTileId,
  type TileBounds,
  type Viewport
} from '@/lib/map/tiles'

describe('Tile Management', () => {
  const testBounds: TileBounds = {
    north: 38.3,
    south: 38.2,
    east: -85.7,
    west: -85.8
  }

  const testViewport: Viewport = {
    sw: [-85.8, 38.2],
    ne: [-85.7, 38.3]
  }

  it('should generate deterministic tile IDs', () => {
    const tileId1 = tileIdForBounds(testBounds, 10)
    const tileId2 = tileIdForBounds(testBounds, 10)
    
    expect(tileId1).toBe(tileId2)
    expect(tileId1).toMatch(/^\d+-\d+-\d+$/)
  })

  it('should generate different tile IDs for different zoom levels', () => {
    const tileId10 = tileIdForBounds(testBounds, 10)
    const tileId11 = tileIdForBounds(testBounds, 11)
    
    expect(tileId10).not.toBe(tileId11)
  })

  it('should generate different tile IDs for different bounds', () => {
    const bounds1 = { ...testBounds, north: 38.3 }
    const bounds2 = { ...testBounds, north: 38.4 }
    
    const tileId1 = tileIdForBounds(bounds1, 10)
    const tileId2 = tileIdForBounds(bounds2, 10)
    
    expect(tileId1).not.toBe(tileId2)
  })

  it('should get adjacent tile IDs', () => {
    const tileId = '10-5-3'
    const adjacent = adjacentTileIds(tileId)
    
    expect(adjacent).toContain('10-6-3') // North
    expect(adjacent).toContain('10-5-4') // East
    expect(adjacent).toContain('10-4-3') // South
    expect(adjacent).toContain('10-5-2') // West
    expect(adjacent).toHaveLength(4)
  })

  it('should handle edge cases for adjacent tiles', () => {
    // Test edge case where adjacent tiles would be out of bounds
    const edgeTileId = '10-0-0'
    const adjacent = adjacentTileIds(edgeTileId)
    
    // Should only have East and North adjacent tiles
    expect(adjacent).toContain('10-0-1') // East
    expect(adjacent).toContain('10-1-0') // North
    expect(adjacent).not.toContain('10--1-0') // South (invalid)
    expect(adjacent).not.toContain('10-0--1') // West (invalid)
  })

  it('should convert viewport to tile bounds', () => {
    const bounds = viewportToTileBounds(testViewport, 10)
    
    expect(bounds.north).toBe(testViewport.ne[1])
    expect(bounds.south).toBe(testViewport.sw[1])
    expect(bounds.east).toBe(testViewport.ne[0])
    expect(bounds.west).toBe(testViewport.sw[0])
  })

  it('should get current tile ID from viewport', () => {
    const tileId = getCurrentTileId(testViewport, 10)
    
    expect(tileId).toMatch(/^10-\d+-\d+$/)
  })

  it('should handle invalid tile ID format', () => {
    const invalidTileId = 'invalid-format'
    const adjacent = adjacentTileIds(invalidTileId)
    
    expect(adjacent).toHaveLength(0)
  })

  it('should generate consistent tile IDs for same geographic area', () => {
    const bounds1 = {
      north: 38.25,
      south: 38.20,
      east: -85.75,
      west: -85.80
    }
    const bounds2 = {
      north: 38.24,
      south: 38.21,
      east: -85.76,
      west: -85.79
    }
    
    // These should be in the same tile at zoom 8
    const tileId1 = tileIdForBounds(bounds1, 8)
    const tileId2 = tileIdForBounds(bounds2, 8)
    
    expect(tileId1).toBe(tileId2)
  })

  it('should handle different zoom levels correctly', () => {
    const zoom8 = tileIdForBounds(testBounds, 8)
    const zoom9 = tileIdForBounds(testBounds, 9)
    const zoom10 = tileIdForBounds(testBounds, 10)
    
    expect(zoom8).not.toBe(zoom9)
    expect(zoom9).not.toBe(zoom10)
    expect(zoom8).not.toBe(zoom10)
  })

  it('should generate adjacent tiles for different zoom levels', () => {
    const tileId8 = '8-2-1'
    const tileId9 = '9-4-2'
    
    const adjacent8 = adjacentTileIds(tileId8)
    const adjacent9 = adjacentTileIds(tileId9)
    
    expect(adjacent8).toHaveLength(4)
    expect(adjacent9).toHaveLength(4)
    expect(adjacent8.every(id => id.startsWith('8-'))).toBe(true)
    expect(adjacent9.every(id => id.startsWith('9-'))).toBe(true)
  })
})
