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
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should debounce multiple requests', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data')
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 100 })

    // Make multiple rapid requests
    const promise1 = fetcher.fetch()
    const promise2 = fetcher.fetch()
    const promise3 = fetcher.fetch()

    // Advance time to trigger debounce
    vi.advanceTimersByTime(100)

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
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('data1'), 200)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('data2'), 200)))
    
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 50 })

    // First request
    const promise1 = fetcher.fetch()
    
    // Advance time to trigger first request
    vi.advanceTimersByTime(50)
    
    // Second request before first completes
    const promise2 = fetcher.fetch()
    
    // Advance time to trigger second request
    vi.advanceTimersByTime(50)
    
    // Advance time for second request to complete
    vi.advanceTimersByTime(200)

    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1.cancelled).toBe(true)
    expect(result2.cancelled).toBe(false)
    expect(result2.data).toBe('data2')
  })

  it('should handle fetch errors gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'))
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 100 })

    const result = await fetcher.fetch()
    
    vi.advanceTimersByTime(100)
    
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Network error')
    expect(result.cancelled).toBe(false)
  })

  it('should handle abort signals', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn().mockImplementation((signal) => {
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('AbortError'))
        })
        setTimeout(resolve, 100)
      })
    })
    
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 50 })

    const promise = fetcher.fetch()
    
    // Advance time to trigger request
    vi.advanceTimersByTime(50)
    
    // Abort the request
    controller.abort()
    
    // Advance time for abort to take effect
    vi.advanceTimersByTime(50)

    const result = await promise
    expect(result.cancelled).toBe(true)
  })

  it('should add viewport padding correctly', () => {
    const bounds = {
      north: 40,
      south: 38,
      east: -85,
      west: -87
    }

    const padded = addViewportPadding(bounds, 0.1) // 10% padding

    expect(padded.north).toBeGreaterThan(bounds.north)
    expect(padded.south).toBeLessThan(bounds.south)
    expect(padded.east).toBeGreaterThan(bounds.east)
    expect(padded.west).toBeLessThan(bounds.west)
  })

  it('should check payload size limits', () => {
    const smallData = [{ id: '1', title: 'Test' }]
    const largeData = new Array(10000).fill({ id: '1', title: 'Test' })

    expect(isPayloadWithinLimits(smallData, 1000)).toBe(true)
    expect(isPayloadWithinLimits(largeData, 1000)).toBe(false)
  })

  it('should degrade payload when over limit', () => {
    const largeData = new Array(1000).fill({ 
      id: '1', 
      title: 'Test', 
      lat: 38.2527,
      lng: -85.7585,
      description: 'Long description',
      extra: 'data'
    })

    const degraded = degradePayloadIfNeeded(largeData, 1000)

    expect(degraded[0]).toEqual({
      id: '1',
      title: 'Test',
      lat: 38.2527,
      lng: -85.7585
    })
    expect(degraded[0]).not.toHaveProperty('description')
    expect(degraded[0]).not.toHaveProperty('extra')
  })

  it('should not degrade payload when within limits', () => {
    const smallData = [{ id: '1', title: 'Test' }]
    const result = degradePayloadIfNeeded(smallData, 10000)

    expect(result).toEqual(smallData)
  })

  it('should handle rapid pan/zoom with debouncing', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data')
    const fetcher = createDebouncedFetcher(fetchFn, { debounceMs: 300 })

    // Simulate rapid pan/zoom
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(fetcher.fetch())
    }

    // Advance time to trigger debounce
    vi.advanceTimersByTime(300)

    const results = await Promise.all(promises)

    // Only one request should have been made
    expect(fetchFn).toHaveBeenCalledTimes(1)
    
    // All but the last should be cancelled
    const cancelledCount = results.filter(r => r.cancelled).length
    expect(cancelledCount).toBe(9)
  })

  it('should respect timeout limits', async () => {
    const fetchFn = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 2000))
    )
    
    const fetcher = createDebouncedFetcher(fetchFn, { 
      debounceMs: 100,
      timeoutMs: 1000 
    })

    const result = await fetcher.fetch()
    
    vi.advanceTimersByTime(100)
    vi.advanceTimersByTime(1000)

    expect(result.cancelled).toBe(true)
  })
})
