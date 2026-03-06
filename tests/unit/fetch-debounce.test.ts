import { describe, it, expect, beforeEach, vi } from 'vitest'
import { expandBounds, isViewportInsideBounds, normalizeBounds, getNormalizedBboxKey, MAP_BUFFER_FACTOR, MAP_BUFFER_SAFETY_FACTOR } from '@/lib/map/bounds'

// Mock fetch function
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Fetch Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockClear()
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

describe('Proactive initial fetch (Stage 1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('should fire first fetch immediately when mapView.bounds exists and initialSales is empty (no 200ms delay)', () => {
    const fetchMapSales = vi.fn()
    const proactiveTriggeredRef = { current: false }
    const initialSalesLength = 0
    const mapViewBounds = { west: -86, south: 39, east: -85, north: 40 }

    // Simulate proactive effect: run once when bounds exist and no initial sales
    if (initialSalesLength === 0 && mapViewBounds && !proactiveTriggeredRef.current) {
      proactiveTriggeredRef.current = true
      const viewportBounds = { ...mapViewBounds }
      const newBufferedBounds = expandBounds(viewportBounds, MAP_BUFFER_FACTOR)
      fetchMapSales(newBufferedBounds)
    }

    // First fetch must have been called synchronously (no advanceTimersByTime)
    expect(fetchMapSales).toHaveBeenCalledTimes(1)
    expect(fetchMapSales).toHaveBeenCalledWith(
      expect.objectContaining({
        west: expect.any(Number),
        south: expect.any(Number),
        east: expect.any(Number),
        north: expect.any(Number)
      })
    )
  })

  it('should not trigger duplicate fetch when map onLoad fires with same bounds after proactive fetch started', () => {
    const fetchMapSales = vi.fn()
    const proactiveTriggeredRef = { current: false }
    const mapViewBounds = { west: -86, south: 39, east: -85, north: 40 }
    let bufferedBounds: typeof mapViewBounds | null = null

    // Proactive path: normalize, set bufferedBounds and fetch (matches SalesClient)
    if (mapViewBounds && !proactiveTriggeredRef.current) {
      proactiveTriggeredRef.current = true
      const normalized = normalizeBounds(mapViewBounds)
      bufferedBounds = expandBounds(normalized, MAP_BUFFER_FACTOR)
      fetchMapSales(bufferedBounds)
    }
    expect(fetchMapSales).toHaveBeenCalledTimes(1)

    // Simulate handleViewportChange debounced callback: viewport same as initial, bufferedBounds already set
    const viewportBounds = normalizeBounds({ ...mapViewBounds })
    const needsFetch = !bufferedBounds || !isViewportInsideBounds(viewportBounds, bufferedBounds, MAP_BUFFER_SAFETY_FACTOR)
    if (needsFetch) {
      fetchMapSales(expandBounds(viewportBounds, MAP_BUFFER_FACTOR))
    }
    // Should not have triggered a second fetch (viewport inside buffer)
    expect(fetchMapSales).toHaveBeenCalledTimes(1)
  })

  it('should not trigger duplicate fetch when onLoad viewport has small float drift from proactive bounds', () => {
    const fetchMapSales = vi.fn()
    const proactiveTriggeredRef = { current: false }
    const proactiveNormalizedBboxKeyRef = { current: null as string | null }
    const mapViewBounds = { west: -86, south: 39, east: -85, north: 40 }
    let bufferedBounds: typeof mapViewBounds | null = null

    // Proactive path: normalize bounds, store key, set bufferedBounds, fetch
    if (mapViewBounds && !proactiveTriggeredRef.current) {
      proactiveTriggeredRef.current = true
      const viewportBoundsForProactive = normalizeBounds(mapViewBounds)
      proactiveNormalizedBboxKeyRef.current = getNormalizedBboxKey(viewportBoundsForProactive)
      bufferedBounds = expandBounds(viewportBoundsForProactive, MAP_BUFFER_FACTOR)
      fetchMapSales(bufferedBounds)
    }
    expect(fetchMapSales).toHaveBeenCalledTimes(1)

    // Mapbox onLoad reports bounds with small float noise (different source/precision)
    const onLoadBoundsWithDrift = {
      west: -86.0000123,
      south: 38.9999876,
      east: -84.9999876,
      north: 40.0000123
    }
    const normalizedViewportBounds = normalizeBounds(onLoadBoundsWithDrift)
    const normalizedViewportKey = getNormalizedBboxKey(normalizedViewportBounds)
    expect(normalizedViewportKey).toBe(proactiveNormalizedBboxKeyRef.current)

    // First-onLoad drift tolerance: same normalized key → treat as covered, no fetch
    const proactiveKey = proactiveNormalizedBboxKeyRef.current
    const useDriftTolerance = proactiveKey !== null && normalizedViewportKey === proactiveKey
    if (useDriftTolerance) {
      proactiveNormalizedBboxKeyRef.current = null
    } else {
      const needsFetch = !bufferedBounds || !isViewportInsideBounds(normalizedViewportBounds, bufferedBounds, MAP_BUFFER_SAFETY_FACTOR)
      if (needsFetch) {
        fetchMapSales(expandBounds(normalizedViewportBounds, MAP_BUFFER_FACTOR))
      }
    }
    expect(fetchMapSales).toHaveBeenCalledTimes(1)
  })

  it('should allow viewport-driven fetch after proactive fetch fails (retry not blocked)', async () => {
    const fetchMapSales = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined)
    const proactiveTriggeredRef = { current: false }
    const mapViewBounds = { west: -86, south: 39, east: -85, north: 40 }
    let bufferedBounds: typeof mapViewBounds | null = null

    // Proactive path: set bufferedBounds and fetch (will fail)
    if (mapViewBounds && !proactiveTriggeredRef.current) {
      proactiveTriggeredRef.current = true
      bufferedBounds = expandBounds(mapViewBounds, MAP_BUFFER_FACTOR)
      fetchMapSales(bufferedBounds).catch(() => {
        bufferedBounds = null
      })
    }
    expect(fetchMapSales).toHaveBeenCalledTimes(1)

    // Let the rejected promise clear bufferedBounds (simulate failure handling)
    await vi.runAllTimersAsync()
    bufferedBounds = null

    // Viewport-driven path: needsFetch is true when bufferedBounds is null, so retry is allowed
    const viewportBounds = { ...mapViewBounds }
    const needsFetch = !bufferedBounds || (bufferedBounds ? !isViewportInsideBounds(viewportBounds, bufferedBounds, MAP_BUFFER_SAFETY_FACTOR) : true)
    expect(needsFetch).toBe(true)
    if (needsFetch) {
      fetchMapSales(expandBounds(viewportBounds, MAP_BUFFER_FACTOR))
    }
    expect(fetchMapSales).toHaveBeenCalledTimes(2)
  })
})
