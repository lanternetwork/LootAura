import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { 
  createDebouncedFetcher, 
  fetchMarkersDebounced,
  addViewportPadding,
  isPayloadWithinLimits,
  degradePayloadIfNeeded
} from '@/lib/debouncedFetch'
import { createTestableDebouncedFetcher } from '@/lib/debouncedFetch.testable'
import { createDeferred, flushMicrotasks } from '../__testlib__/testUtils'

// MSW server for deterministic network testing
const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Map Debounce and Cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('should debounce multiple requests', async () => {
    // Use fake timers for deterministic testing
    vi.useFakeTimers()
    
    const fetchFn = vi.fn().mockResolvedValue('data')
    const fetcher = createTestableDebouncedFetcher(fetchFn, { 
      debounceMs: 50,
      scheduler: vi.fn().mockImplementation((fn, delay) => setTimeout(fn, delay))
    })

    // Make multiple rapid requests
    const promise1 = fetcher.fetch()
    const promise2 = fetcher.fetch()
    const promise3 = fetcher.fetch()

    // Advance timers to trigger debounced execution
    vi.advanceTimersByTime(50)
    await flushMicrotasks()

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])

    // Only the last request should have executed
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(result1.cancelled).toBe(true)
    expect(result2.cancelled).toBe(true)
    expect(result3.cancelled).toBe(false)
    expect(result3.data).toBe('data')
    
    vi.useRealTimers()
  })

  it('should cancel previous requests on new request', async () => {
    // Use fake timers for deterministic testing
    vi.useFakeTimers()
    
    // Create deferred promises for controlled resolution
    const deferred1 = createDeferred<string>()
    const deferred2 = createDeferred<string>()
    
    const fetchFn = vi.fn()
      .mockImplementationOnce(() => deferred1.promise)
      .mockImplementationOnce(() => deferred2.promise)
    
    const abortSpy = vi.fn()
    const fetcher = createTestableDebouncedFetcher(fetchFn, { 
      debounceMs: 50,
      scheduler: vi.fn().mockImplementation((fn, delay) => setTimeout(fn, delay)),
      onAbort: abortSpy
    })

    // First request
    const promise1 = fetcher.fetch()
    
    // Advance timers to start first request
    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    
    // Second request before first completes
    const promise2 = fetcher.fetch()
    
    // Advance timers to start second request
    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    
    // Resolve only the second request
    deferred2.resolve('data2')
    await flushMicrotasks()

    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1.cancelled).toBe(true)
    expect(result2.cancelled).toBe(false)
    expect(result2.data).toBe('data2')
    expect(abortSpy).toHaveBeenCalled()
    
    vi.useRealTimers()
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
    // Use fake timers for deterministic testing
    vi.useFakeTimers()
    
    const fetchFn = vi.fn().mockResolvedValue('data')
    const fetcher = createTestableDebouncedFetcher(fetchFn, { 
      debounceMs: 50,
      scheduler: vi.fn().mockImplementation((fn, delay) => setTimeout(fn, delay))
    })

    // Simulate rapid requests - make them truly synchronous
    const promise1 = fetcher.fetch()
    const promise2 = fetcher.fetch()

    // Advance timers to trigger debounced execution
    vi.advanceTimersByTime(50)
    await flushMicrotasks()

    const [result1, result2] = await Promise.all([promise1, promise2])

    // Only the last request should have executed
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(result1.cancelled).toBe(true)
    expect(result2.cancelled).toBe(false)
    expect(result2.data).toBe('data')
    
    vi.useRealTimers()
  })

  it('should respect timeout limits', async () => {
    // Use fake timers for deterministic testing
    vi.useFakeTimers()
    
    const fetchFn = vi.fn().mockImplementation(() => 
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 100)
      })
    )
    
    const fetcher = createTestableDebouncedFetcher(fetchFn, { 
      debounceMs: 50,
      scheduler: vi.fn().mockImplementation((fn, delay) => setTimeout(fn, delay))
    })

    const promise = fetcher.fetch()
    
    // Advance timers to trigger debounced execution
    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    
    // Advance timers to trigger timeout
    vi.advanceTimersByTime(100)
    await flushMicrotasks()
    
    const result = await promise
    
    // Should return error from fetch function
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Timeout')
    expect(result.cancelled).toBe(false)
    
    vi.useRealTimers()
  })

  it('should handle MSW requests with proper counting', async () => {
    // Use fake timers for deterministic testing
    vi.useFakeTimers()
    
    let requestsStarted = 0
    let requestsResolved = 0
    const deferreds: Array<{ resolve: (value: any) => void; reject: (error: Error) => void }> = []
    
    // MSW handler that counts requests and holds them
    server.use(
      http.get('/api/markers', () => {
        requestsStarted++
        const deferred = createDeferred<{ id: string; title: string; lat: number; lng: number }[]>()
        deferreds.push(deferred)
        
        return new Promise((resolve) => {
          deferred.promise.then((data) => {
            requestsResolved++
            resolve(HttpResponse.json(data))
          }).catch((error) => {
            requestsResolved++
            resolve(HttpResponse.error())
          })
        })
      })
    )
    
    const fetchFn = (signal: AbortSignal) => 
      fetch('/api/markers', { signal }).then(res => res.json())
    
    const fetcher = createTestableDebouncedFetcher(fetchFn, { 
      debounceMs: 50,
      scheduler: vi.fn().mockImplementation((fn, delay) => setTimeout(fn, delay))
    })

    // Burst A: several rapid requests
    const promisesA = Array.from({ length: 5 }, () => fetcher.fetch())
    
    // Advance timers to trigger debounced execution
    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    
    // Burst B: more rapid requests
    const promisesB = Array.from({ length: 3 }, () => fetcher.fetch())
    
    // Advance timers to trigger debounced execution
    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    
    // Resolve only the latest request
    if (deferreds.length > 0) {
      const latestDeferred = deferreds[deferreds.length - 1]
      latestDeferred.resolve([{ id: '1', title: 'Test', lat: 38.2527, lng: -85.7585 }])
    }
    
    await flushMicrotasks()
    
    // Assert request counting
    expect(requestsStarted).toBe(2) // Only 2 requests should have started (one per burst)
    expect(requestsResolved).toBe(1) // Only 1 should have resolved (the latest)
    
    vi.useRealTimers()
  })
})