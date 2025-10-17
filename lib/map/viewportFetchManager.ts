// Testable viewport fetch manager with dependency injection
// Provides debounced viewport-based data fetching with abort control

export type Viewport = {
  sw: [number, number]
  ne: [number, number]
}

export type Filters = {
  categories?: string[]
  q?: string
  dateRange?: {
    from: string
    to: string
  }
}

export interface ViewportFetchManagerOptions {
  debounceMs?: number
  schedule?: (fn: () => void, ms: number) => any
  fetcher: (viewport: Viewport, filters: Filters, signal: AbortSignal) => Promise<any>
  controllerFactory?: () => AbortController
  onAbort?: (reason: string) => void
  onStart?: () => void
  onResolve?: (result: any) => void
}

export interface ViewportFetchManager {
  request(viewport: Viewport, filters: Filters): void
  getStats(): { started: number; aborted: number; resolved: number }
  dispose(): void
}

export function createViewportFetchManager(options: ViewportFetchManagerOptions): ViewportFetchManager {
  const {
    debounceMs = 300,
    schedule = (fn, ms) => setTimeout(fn, ms),
    fetcher,
    controllerFactory = () => new AbortController(),
    onAbort,
    onStart,
    onResolve
  } = options

  let timeoutId: any = null
  let currentController: AbortController | null = null
  let stats = { started: 0, aborted: 0, resolved: 0 }

  const request = (viewport: Viewport, filters: Filters): void => {
    // Clear previous timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // Abort previous request if still in flight
    if (currentController) {
      currentController.abort()
      stats.aborted++
      if (onAbort) {
        onAbort('new request')
      }
    }

    // Schedule new request
    timeoutId = schedule(() => {
      // Create new abort controller
      currentController = controllerFactory()
      stats.started++
      
      if (onStart) {
        onStart()
      }

      // Execute fetch
      fetcher(viewport, filters, currentController.signal)
        .then((result) => {
          // Only resolve if this is still the current request
          if (currentController && !currentController.signal.aborted) {
            stats.resolved++
            if (onResolve) {
              onResolve(result)
            }
          }
        })
        .catch((error) => {
          // Only count as error if not aborted
          if (currentController && !currentController.signal.aborted) {
            if (onAbort) {
              onAbort('fetch error')
            }
          }
        })
        .finally(() => {
          currentController = null
        })
    }, debounceMs)
  }

  const getStats = (): { started: number; aborted: number; resolved: number } => {
    return { ...stats }
  }

  const dispose = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  }

  return {
    request,
    getStats,
    dispose
  }
}
