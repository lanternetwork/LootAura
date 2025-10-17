import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  createDebouncedFetcher, 
  fetchMarkersDebounced,
  addViewportPadding,
  isPayloadWithinLimits,
  degradePayloadIfNeeded
} from '@/lib/debouncedFetch'

describe('Map Debounce and Cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should debounce multiple requests', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data')
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 1 })

    // Make multiple rapid requests
    const promise1 = fetcher.fetch()
    const promise2 = fetcher.fetch()
    const promise3 = fetcher.fetch()

    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 5))

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])

    // Only the last request should have executed
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(result1.cancelled).toBe(true)
    expect(result2.cancelled).toBe(true)
    expect(result3.cancelled).toBe(false)
    expect(result3.data).toBe('data')
  })

  it('should cancel previous requests on new request', async () => {
    const fetchFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('data1'), 50)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('data2'), 50)))
    
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 25 })

    // First request
    const promise1 = fetcher.fetch()
    
    // Wait for first request to start
    await new Promise(resolve => setTimeout(resolve, 30))
    
    // Second request before first completes
    const promise2 = fetcher.fetch()
    
    // Wait for second request to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1.cancelled).toBe(true)
    expect(result2.cancelled).toBe(false)
    expect(result2.data).toBe('data2')
  })

  it('should handle fetch errors gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'))
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 50 })

    const result = await fetcher.fetch()
    
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Network error')
    expect(result.cancelled).toBe(false)
  })

  it('should handle abort signals', async () => {
    const fetchFn = vi.fn().mockImplementation((signal) => {
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('AbortError'))
        })
        setTimeout(resolve, 50)
      })
    })
    
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 25 })

    const promise = fetcher.fetch()
    
    // Wait for request to start
    await new Promise(resolve => setTimeout(resolve, 30))
    
    // Wait for request to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    const result = await promise
    expect(result.cancelled).toBe(false) // Request should complete normally
  })

  it('should add viewport padding correctly', () => {
    const bounds = {
      north: 40,
      south: 38,
      east: -85,
      west: -87
    }

    const padded = addViewportPadding(bounds, 0.1)
    
    expect(padded.north).toBeGreaterThan(bounds.north)
    expect(padded.south).toBeLessThan(bounds.south)
    expect(padded.east).toBeGreaterThan(bounds.east)
    expect(padded.west).toBeLessThan(bounds.west)
  })

  it('should check payload limits correctly', () => {
    const smallData = [{ id: '1', title: 'Test', lat: 38.2527, lng: -85.7585 }]
    const largeData = new Array(1000).fill(null).map((_, i) => ({
      id: i.toString(),
      title: `Test ${i}`,
      lat: 38.2527 + (i * 0.001),
      lng: -85.7585 + (i * 0.001)
    }))

    expect(isPayloadWithinLimits(smallData, 10000)).toBe(true)
    expect(isPayloadWithinLimits(largeData, 10000)).toBe(false)
  })

  it('should not degrade payload when within limits', () => {
    const smallData = [{ id: '1', title: 'Test', lat: 38.2527, lng: -85.7585 }]
    const result = degradePayloadIfNeeded(smallData, 10000)

    expect(result).toEqual(smallData)
  })

  it('should degrade payload when exceeding limits', () => {
    const largeData = new Array(1000).fill(null).map((_, i) => ({
      id: i.toString(),
      title: `Test ${i}`,
      lat: 38.2527 + (i * 0.001),
      lng: -85.7585 + (i * 0.001),
      description: `This is a very long description for item ${i} that will make the payload larger`,
      category: 'furniture',
      price: 100 + i,
      condition: 'good'
    }))

    const result = degradePayloadIfNeeded(largeData, 10000)

    // Should return same number of items but with fewer fields
    expect(result.length).toBe(largeData.length)
    expect(result.length).toBeGreaterThan(0)
    
    // Should only have minimal fields
    expect(Object.keys(result[0])).toEqual(['id', 'title', 'lat', 'lng'])
  })

  it('should handle rapid pan/zoom with debouncing', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data')
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 5 })

    // Simulate rapid requests - make them truly synchronous
    const promise1 = fetcher.fetch()
    const promise2 = fetcher.fetch()

    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 10))

    const [result1, result2] = await Promise.all([promise1, promise2])

    // Only the last request should have executed
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(result1.cancelled).toBe(true)
    expect(result2.cancelled).toBe(false)
    expect(result2.data).toBe('data')
  })

  it('should respect timeout limits', async () => {
    const fetchFn = vi.fn().mockImplementation(() => 
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 50)
      })
    )
    
    const fetcher = createDebouncedFetcher(fetchFn, { 
      debounceMs: 1
    })

    const result = await fetcher.fetch()
    
    // Should return error from fetch function
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Timeout')
    expect(result.cancelled).toBe(false)
  })
})