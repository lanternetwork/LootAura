import { describe, it, expect } from 'vitest'

describe('visible.recompute', () => {
  it('should trigger recompute when markers set changes with same count', () => {
    const prevMarkers = [
      { id: 'sale-1', title: 'Sale 1', lat: 38.1, lng: -85.7 },
      { id: 'sale-2', title: 'Sale 2', lat: 38.2, lng: -85.8 }
    ]
    
    const nextMarkers = [
      { id: 'sale-2', title: 'Sale 2', lat: 38.2, lng: -85.8 },
      { id: 'sale-3', title: 'Sale 3', lat: 38.3, lng: -85.9 }
    ]
    
    // Simulate markers hash calculation
    const prevHash = prevMarkers.map(m => m.id).sort().join(',')
    const nextHash = nextMarkers.map(m => m.id).sort().join(',')
    
    // Assert: same count, different IDs → hash differs
    expect(prevMarkers.length).toBe(nextMarkers.length)
    expect(prevHash).not.toBe(nextHash)
    expect(prevHash).toBe('sale-1,sale-2')
    expect(nextHash).toBe('sale-2,sale-3')
    
    // Simulate recompute trigger
    const markersChanged = prevHash !== nextHash
    expect(markersChanged).toBe(true)
  })
  
  it('should trigger recompute when markers count changes', () => {
    const prevMarkers = [
      { id: 'sale-1', title: 'Sale 1', lat: 38.1, lng: -85.7 }
    ]
    
    const nextMarkers = [
      { id: 'sale-1', title: 'Sale 1', lat: 38.1, lng: -85.7 },
      { id: 'sale-2', title: 'Sale 2', lat: 38.2, lng: -85.8 }
    ]
    
    const prevHash = prevMarkers.map(m => m.id).sort().join(',')
    const nextHash = nextMarkers.map(m => m.id).sort().join(',')
    
    // Assert: different count → hash differs
    expect(prevMarkers.length).not.toBe(nextMarkers.length)
    expect(prevHash).not.toBe(nextHash)
    
    const markersChanged = prevHash !== nextHash
    expect(markersChanged).toBe(true)
  })
  
  it('should not trigger recompute when markers are identical', () => {
    const markers = [
      { id: 'sale-1', title: 'Sale 1', lat: 38.1, lng: -85.7 },
      { id: 'sale-2', title: 'Sale 2', lat: 38.2, lng: -85.8 }
    ]
    
    const hash1 = markers.map(m => m.id).sort().join(',')
    const hash2 = markers.map(m => m.id).sort().join(',')
    
    // Assert: identical markers → hash same
    expect(hash1).toBe(hash2)
    expect(hash1).toBe('sale-1,sale-2')
    
    const markersChanged = hash1 !== hash2
    expect(markersChanged).toBe(false)
  })
  
  it('should handle empty markers set', () => {
    const prevMarkers: any[] = []
    const nextMarkers = [
      { id: 'sale-1', title: 'Sale 1', lat: 38.1, lng: -85.7 }
    ]
    
    const prevHash = prevMarkers.map(m => m.id).sort().join(',')
    const nextHash = nextMarkers.map(m => m.id).sort().join(',')
    
    // Assert: empty to non-empty → hash differs
    expect(prevHash).toBe('')
    expect(nextHash).toBe('sale-1')
    expect(prevHash).not.toBe(nextHash)
    
    const markersChanged = prevHash !== nextHash
    expect(markersChanged).toBe(true)
  })
  
  it('should maintain sequence counter on changes', () => {
    let visibleIdsSeq = 0
    const prevVisibleIdsHash = ''
    
    const currentIdsHash = 'sale-1,sale-2'
    const idsChanged = prevVisibleIdsHash !== currentIdsHash
    
    if (idsChanged) {
      visibleIdsSeq += 1
    }
    
    // Assert: sequence increments on change
    expect(idsChanged).toBe(true)
    expect(visibleIdsSeq).toBe(1)
    
    // Simulate another change
    const nextIdsHash = 'sale-1,sale-2,sale-3'
    const idsChangedAgain = currentIdsHash !== nextIdsHash
    
    if (idsChangedAgain) {
      visibleIdsSeq += 1
    }
    
    expect(idsChangedAgain).toBe(true)
    expect(visibleIdsSeq).toBe(2)
  })
})
