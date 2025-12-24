import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock fetch function
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Fetch Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should debounce fetch calls with 200ms delay', () => {
    const debounceTimerRef = { current: null as NodeJS.Timeout | null }
    const fetchMapSales = vi.fn()
    
    // Simulate the debounce logic from SalesClient
    const handleViewportChange = (bounds: any) => {
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      
      // Debounce fetch by 200ms
      debounceTimerRef.current = setTimeout(() => {
        fetchMapSales(bounds)
      }, 200)
    }

    // Call multiple times rapidly
    handleViewportChange({ north: 40, south: 39, east: -85, west: -86 })
    handleViewportChange({ north: 40.1, south: 39.1, east: -84.9, west: -85.9 })
    handleViewportChange({ north: 40.2, south: 39.2, east: -84.8, west: -85.8 })

    // Should not have been called yet
    expect(fetchMapSales).not.toHaveBeenCalled()

    // Fast forward 200ms
    vi.advanceTimersByTime(200)

    // Should have been called only once with the last bounds
    expect(fetchMapSales).toHaveBeenCalledTimes(1)
    expect(fetchMapSales).toHaveBeenCalledWith({ north: 40.2, south: 39.2, east: -84.8, west: -85.8 })
  })

  it('should cancel previous timer when new bounds arrive', () => {
    const debounceTimerRef = { current: null as NodeJS.Timeout | null }
    const fetchMapSales = vi.fn()
    
    const handleViewportChange = (bounds: any) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      
      debounceTimerRef.current = setTimeout(() => {
        fetchMapSales(bounds)
      }, 200)
    }

    // First call
    handleViewportChange({ north: 40, south: 39, east: -85, west: -86 })
    
    // Advance 100ms (before timeout)
    vi.advanceTimersByTime(100)
    
    // Second call should cancel the first
    handleViewportChange({ north: 40.1, south: 39.1, east: -84.9, west: -85.9 })
    
    // Advance another 200ms (total 300ms from start)
    vi.advanceTimersByTime(200)
    
    // Should only be called once with the second bounds
    expect(fetchMapSales).toHaveBeenCalledTimes(1)
    expect(fetchMapSales).toHaveBeenCalledWith({ north: 40.1, south: 39.1, east: -84.9, west: -85.9 })
  })

  it('should handle multiple separate calls correctly', () => {
    const debounceTimerRef = { current: null as NodeJS.Timeout | null }
    const fetchMapSales = vi.fn()
    
    const handleViewportChange = (bounds: any) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      
      debounceTimerRef.current = setTimeout(() => {
        fetchMapSales(bounds)
      }, 200)
    }

    // First call
    handleViewportChange({ north: 40, south: 39, east: -85, west: -86 })
    vi.advanceTimersByTime(200)
    expect(fetchMapSales).toHaveBeenCalledTimes(1)

    // Second call after first completed
    handleViewportChange({ north: 40.1, south: 39.1, east: -84.9, west: -85.9 })
    vi.advanceTimersByTime(200)
    expect(fetchMapSales).toHaveBeenCalledTimes(2)
  })
})
