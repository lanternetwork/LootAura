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
      debounceMode: 'trailing',
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

      // No requests should start immediately in trailing mode
      expect(manager.getStats()).toEqual({ started: 0, aborted: 0, resolved: 0 })
      expect(mockFetcher).toHaveBeenCalledTimes(0)
      expect(onStart).toHaveBeenCalledTimes(0)

      // Advance timers to trigger trailing execution
      vi.advanceTimersByTime(300)

      // Should be only one fetch (trailing mode collapses all requests)
      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 0 })
      expect(mockFetcher).toHaveBeenCalledTimes(1)

      // Resolve the final fetch
      deferred.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 1 })
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
      vi.advanceTimersByTime(50) // No fetch yet in trailing mode

      // Trigger second request - should cancel the first trailing timer
      manager.request(viewport, filters)
      vi.advanceTimersByTime(50) // Still no fetch yet

      // No requests should have started yet in trailing mode
      expect(manager.getStats()).toEqual({ started: 0, aborted: 0, resolved: 0 })
      expect(onAbort).not.toHaveBeenCalled()

      // Advance timers to trigger the trailing execution
      vi.advanceTimersByTime(300)
      
      // Now the fetch should start
      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 0 })
      
      // Resolve the fetch (it will use deferredA since there's only one call in trailing mode)
      deferredA.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 1 })
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

      // In trailing mode, no requests start immediately
      manager.request(viewport, filters) // A
      expect(manager.getStats()).toEqual({ started: 0, aborted: 0, resolved: 0 })

      // Call B - should cancel A's timer
      manager.request(viewport, filters) // B
      expect(manager.getStats()).toEqual({ started: 0, aborted: 0, resolved: 0 })

      // Call C - should cancel B's timer
      manager.request(viewport, filters) // C
      expect(manager.getStats()).toEqual({ started: 0, aborted: 0, resolved: 0 })

      // Advance timers to trigger the final trailing execution
      vi.advanceTimersByTime(300)
      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 0 })

      // Only the first deferred should resolve (since there's only one call in trailing mode)
      deferredA.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 1 })
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
      vi.advanceTimersByTime(300) // Trigger trailing execution

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
      vi.advanceTimersByTime(300) // Trigger first trailing execution

      // Get the abort signal that was passed
      const abortSignal = mockFetcher.mock.calls[0][2] as AbortSignal
      expect(abortSignal.aborted).toBe(false)

      // Trigger new request - this should cancel the first timer and start a new one
      manager.request(viewport, filters)
      vi.advanceTimersByTime(300) // Trigger second trailing execution

      // The first signal should be aborted by the second request
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
      vi.advanceTimersByTime(50) // No fetch yet in trailing mode

      expect(manager.getStats()).toEqual({ started: 0, aborted: 0, resolved: 0 })

      // Dispose should cancel the timer
      manager.dispose()

      expect(manager.getStats()).toEqual({ started: 0, aborted: 0, resolved: 0 })
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

      expect(manager.getStats()).toEqual({ started: 1, aborted: 0, resolved: 1 })

      // Second request - complete
      manager.request(viewport, filters)
      vi.advanceTimersByTime(300) // Wait for trailing
      deferred2.resolve({ success: true })
      await flushMicrotasks()

      expect(manager.getStats()).toEqual({ started: 2, aborted: 0, resolved: 2 })
    })
  })
})
