// Testable version of debounced fetch with dependency injection
// This module is designed for testing and includes DI surface

export interface TestableDebouncedFetchOptions {
  debounceMs?: number
  maxRetries?: number
  timeoutMs?: number
  scheduler?: (fn: () => void, delay: number) => NodeJS.Timeout
  onAbort?: (requestId: number) => void
}

export interface TestableDebouncedFetchResult<T> {
  data: T | null
  error: Error | null
  cancelled: boolean
}

class TestableDebouncedFetcher<T> {
  private timeoutId: NodeJS.Timeout | null = null
  private abortController: AbortController | null = null
  private lastRequestId = 0

  constructor(
    private fetchFn: (signal: AbortSignal) => Promise<T>,
    private options: TestableDebouncedFetchOptions = {}
  ) {
    this.options = {
      debounceMs: 300,
      maxRetries: 3,
      timeoutMs: 10000,
      scheduler: setTimeout,
      ...options
    }
  }

  async fetch(): Promise<TestableDebouncedFetchResult<T>> {
    // Cancel previous request
    if (this.abortController) {
      this.abortController.abort()
      if (this.options.onAbort) {
        this.options.onAbort(this.lastRequestId)
      }
    }

    // Clear previous timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }

    // Create new abort controller
    this.abortController = new AbortController()
    const requestId = ++this.lastRequestId

    return new Promise((resolve) => {
      this.timeoutId = this.options.scheduler!(async () => {
        try {
          // Check if this is still the latest request
          if (requestId !== this.lastRequestId) {
            resolve({ data: null, error: null, cancelled: true })
            return
          }

          const data = await this.fetchFn(this.abortController!.signal)
          
          // Check again if this is still the latest request
          if (requestId !== this.lastRequestId) {
            resolve({ data: null, error: null, cancelled: true })
            return
          }

          resolve({ data, error: null, cancelled: false })
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            resolve({ data: null, error: null, cancelled: true })
          } else {
            resolve({ data: null, error: error as Error, cancelled: false })
          }
        }
      }, this.options.debounceMs!)
    })
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      if (this.options.onAbort) {
        this.options.onAbort(this.lastRequestId)
      }
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }
  }

  destroy(): void {
    this.cancel()
  }
}

/**
 * Create a testable debounced fetcher with dependency injection
 * This is the test-only factory mentioned in the requirements
 */
export function createTestableDebouncedFetcher<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  options?: TestableDebouncedFetchOptions
): TestableDebouncedFetcher<T> {
  return new TestableDebouncedFetcher(fetchFn, options)
}
