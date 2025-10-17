import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest'
import { createViewportFetchManager, type Viewport, type Filters } from '@/lib/map/viewportFetchManager'

// Test utilities
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Viewport Fetch Manager', () => {
  let manager: ReturnType<typeof createViewportFetchManager>
  let mockFetcher: MockedFunction<any>
  let mockSchedule: MockedFunction<any>
  let mockControllerFactory: MockedFunction<any>
  let onAbort: MockedFunction<any>
  let onStart: MockedFunction<any>
  let onResolve: MockedFunction<any>

  beforeEach(() => {
    vi.useFakeTimers()
    
    mockFetcher = vi.fn()
    mockSchedule = vi.fn().mockImplementation((fn, ms) => setTimeout(fn, ms))
    mockControllerFactory = vi.fn().mockImplementation(() => new AbortController())
    onAbort = vi.fn()
    onStart = vi.fn()
    onResolve = vi.fn()

    manager = createViewportFetchManager({
      debounceMs: 300,
      debounceMode: 'leading-trailing',
      schedule: mockSchedule,
      fetcher: mockFetcher,
      controllerFactory: mockControllerFactory,
      onAbort,
      onStart,
      onResolve
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  describe('Debounce collapse', () => {
    it('should collapse multiple rapid requests into single fetch', async () => {
      const deferred = createDeferred<{ success: boolean }>()
      mockFetcher.mockReturnValue(deferred.promise)

      // Trigger 5 rapid requests
      const viewport: Viewport = { sw: [0, 0], ne: [1, 1] }
      const filters: Filters = { categories: ['test'] }
      
      for (let i = 0; i < 5; i++) {
        manager.request(viewport, filters)
      }

      // First request should start immediately (leading)
      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 0 })
      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(onStart).toHaveBeenCalledTimes(1)

      // Advance timers to trigger trailing execution
      vi.advanceTimersByTime(300)

      // Should still be only one fetch (trailing replaces the same request)
      expect(manager.getStats()).toEqual({ started: 2, aborted: 1, resolved: 0 })
      expect(mockFetcher).toHaveBeenCalledTimes(2)

      // Resolve the final fetch
      deferred.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 2, aborted: 1, resolved: 1 })
      expect(onResolve).toHaveBeenCalledWith({ success: true })
    })
  })

  describe('Cancel previous on new request', () => {
    it('should abort previous request when new one is triggered', async () => {
      const deferredA = createDeferred<{ success: boolean }>()
      const deferredB = createDeferred<{ success: boolean }>()
      
      mockFetcher
        .mockReturnValueOnce(deferredA.promise)
        .mockReturnValueOnce(deferredB.promise)

      const viewport: Viewport = { sw: [0, 0], ne: [1, 1] }
      const filters: Filters = { categories: ['test'] }

      // Trigger first request
      manager.request(viewport, filters)
      vi.advanceTimersByTime(50) // Start fetch A

      // Trigger second request before A completes
      manager.request(viewport, filters)
      vi.advanceTimersByTime(50) // Start fetch B

      expect(manager.getStats()).toEqual({ started: 2, aborted: 1, resolved: 0 })
      expect(onAbort).toHaveBeenCalledWith('new request')

      // Resolve B
      deferredB.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 2, aborted: 1, resolved: 1 })
      expect(onResolve).toHaveBeenCalledWith({ success: true })
    })
  })

  describe('Rapid pan/zoom burst', () => {
    it('should handle rapid bursts with proper cancellation', async () => {
      const deferredA = createDeferred<{ success: boolean }>()
      const deferredB = createDeferred<{ success: boolean }>()
      const deferredC = createDeferred<{ success: boolean }>()
      
      mockFetcher
        .mockReturnValueOnce(deferredA.promise)
        .mockReturnValueOnce(deferredB.promise)
        .mockReturnValueOnce(deferredC.promise)

      const viewport: Viewport = { sw: [0, 0], ne: [1, 1] }
      const filters: Filters = { categories: ['test'] }

      // Start A immediately (leading)
      manager.request(viewport, filters) // A
      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 0 })

      // Call B, advance by 300ms → starts B & aborts A
      manager.request(viewport, filters) // B
      vi.advanceTimersByTime(300)
      expect(manager.getStats()).toEqual({ started: 2, aborted: 1, resolved: 0 })

      // Call C, advance by 300ms → starts C & aborts B
      manager.request(viewport, filters) // C
      vi.advanceTimersByTime(300)
      expect(manager.getStats()).toEqual({ started: 3, aborted: 2, resolved: 0 })

      // Only C should resolve
      deferredC.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 3, aborted: 2, resolved: 1 })
      expect(onResolve).toHaveBeenCalledWith({ success: true })
    })
  })

  describe('Abort signal handling', () => {
    it('should pass abort signal to fetcher', async () => {
      const deferred = createDeferred<{ success: boolean }>()
      mockFetcher.mockReturnValue(deferred.promise)

      const viewport: Viewport = { sw: [0, 0], ne: [1, 1] }
      const filters: Filters = { categories: ['test'] }

      manager.request(viewport, filters)
      vi.advanceTimersByTime(50)

      expect(mockFetcher).toHaveBeenCalledWith(
        viewport,
        filters,
        expect.any(AbortSignal)
      )

      deferred.resolve({ success: true })
      await flushMicrotasks()
    })

    it('should handle abort signal correctly', async () => {
      const deferred = createDeferred<{ success: boolean }>()
      mockFetcher.mockReturnValue(deferred.promise)

      const viewport: Viewport = { sw: [0, 0], ne: [1, 1] }
      const filters: Filters = { categories: ['test'] }

      manager.request(viewport, filters)
      vi.advanceTimersByTime(50)

      // Get the abort signal that was passed
      const abortSignal = mockFetcher.mock.calls[0][2] as AbortSignal
      expect(abortSignal.aborted).toBe(false)

      // Trigger new request to abort the first one
      manager.request(viewport, filters)
      vi.advanceTimersByTime(50)

      expect(abortSignal.aborted).toBe(true)
    })
  })

  describe('Dispose', () => {
    it('should cancel pending requests on dispose', async () => {
      const deferred = createDeferred<{ success: boolean }>()
      mockFetcher.mockReturnValue(deferred.promise)

      const viewport: Viewport = { sw: [0, 0], ne: [1, 1] }
      const filters: Filters = { categories: ['test'] }

      manager.request(viewport, filters)
      vi.advanceTimersByTime(50)

      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 0 })

      // Dispose should cancel the request
      manager.dispose()

      expect(manager.getStats()).toEqual({ started: 1, aborted: 1, resolved: 0 })
    })
  })

  describe('Stats tracking', () => {
    it('should track stats correctly across multiple operations', async () => {
      const deferred1 = createDeferred<{ success: boolean }>()
      const deferred2 = createDeferred<{ success: boolean }>()
      const deferred3 = createDeferred<{ success: boolean }>()
      
      mockFetcher
        .mockReturnValueOnce(deferred1.promise)
        .mockReturnValueOnce(deferred2.promise)
        .mockReturnValueOnce(deferred3.promise)

      const viewport: Viewport = { sw: [0, 0], ne: [1, 1] }
      const filters: Filters = { categories: ['test'] }

      // First request - complete
      manager.request(viewport, filters)
      vi.advanceTimersByTime(300) // Wait for trailing
      deferred1.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 2, aborted: 1, resolved: 1 })

      // Second request - complete
      manager.request(viewport, filters)
      vi.advanceTimersByTime(300) // Wait for trailing
      deferred2.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 3, aborted: 1, resolved: 2 })
    })
  })
})
