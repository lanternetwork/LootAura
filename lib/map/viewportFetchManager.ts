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
  zoom?: number
}

export interface ViewportFetchManagerOptions {
  debounceMs?: number
  debounceMode?: 'trailing' | 'leading' | 'leading-trailing'
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
    debounceMode = 'trailing',
    schedule = (fn, ms) => setTimeout(fn, ms),
    fetcher,
    controllerFactory = () => new AbortController(),
    onAbort,
    onStart,
    onResolve
  } = options

  let inflight: { controller: AbortController } | null = null
  let debounceTimer: any = null
  let lastArgs: { v: Viewport; f: Filters } | null = null
  const stats = { started: 0, aborted: 0, resolved: 0 }

  const logStats = (): void => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      // eslint-disable-next-line no-console
      console.debug('[MAP:DEBOUNCE]', { ...stats })
    }
  }

  const startFetch = async (args: { v: Viewport; f: Filters }): Promise<void> => {
    // Abort inflight if needed
    if (inflight) {
      inflight.controller.abort()
      stats.aborted++
      if (onAbort) {
        onAbort('trailing-replace')
      }
      logStats()
    }

    // Create new controller
    const controller = controllerFactory()
    inflight = { controller }
    stats.started++
    logStats()
    
    if (onStart) {
      onStart()
    }

    try {
      const result = await fetcher(args.v, args.f, controller.signal)
      
      // Only resolve if this is still the current request
      if (inflight && inflight.controller === controller && !controller.signal.aborted) {
        stats.resolved++
        if (onResolve) {
          onResolve(result)
        }
        logStats()
      }
    } catch (error) {
      // Only count as error if not aborted
      if (inflight && inflight.controller === controller && !controller.signal.aborted) {
        if (onAbort) {
          onAbort('fetch error')
        }
      }
    } finally {
      if (inflight && inflight.controller === controller) {
        inflight = null
      }
    }
  }

  const scheduleTrailing = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = schedule(() => runTrailing(), debounceMs)
  }

  const runTrailing = (): void => {
    if (!lastArgs) return
    
    if (inflight) {
      inflight.controller.abort()
      stats.aborted++
      if (onAbort) {
        onAbort('trailing-replace')
      }
      logStats()
    }
    
    startFetch(lastArgs)
  }

  const request = (viewport: Viewport, filters: Filters): void => {
    lastArgs = { v: viewport, f: filters }

    if (debounceMode === 'trailing') {
      scheduleTrailing()
    } else if (debounceMode === 'leading') {
      if (!inflight && !debounceTimer) {
        startFetch(lastArgs)
      }
      scheduleTrailing()
    } else if (debounceMode === 'leading-trailing') {
      if (!inflight) {
        startFetch(lastArgs)
      }
      scheduleTrailing()
    }
  }

  const getStats = (): { started: number; aborted: number; resolved: number } => {
    return { ...stats }
  }

  const dispose = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (inflight) {
      inflight.controller.abort()
      stats.aborted++
      inflight = null
      logStats()
    }
  }

  return {
    request,
    getStats,
    dispose
  }
}
