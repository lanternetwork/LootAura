// Debounced fetch utility with request cancellation
// Ensures ≤1 request per 300ms and cancels stale requests

export interface DebouncedFetchOptions {
  debounceMs?: number
  maxRetries?: number
  timeoutMs?: number
}

export interface DebouncedFetchResult<T> {
  data: T | null
  error: Error | null
  cancelled: boolean
}

class DebouncedFetcher<T> {
  private timeoutId: NodeJS.Timeout | null = null
  private abortController: AbortController | null = null
  private lastRequestId = 0

  constructor(
    private fetchFn: (signal: AbortSignal) => Promise<T>,
    private options: DebouncedFetchOptions = {}
  ) {
    this.options = {
      debounceMs: 300,
      maxRetries: 3,
      timeoutMs: 10000,
      ...options
    }
  }

  async fetch(): Promise<DebouncedFetchResult<T>> {
    // Cancel previous request
    if (this.abortController) {
      this.abortController.abort()
    }

    // Clear previous timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }

    // Create new abort controller
    this.abortController = new AbortController()
    const requestId = ++this.lastRequestId

    return new Promise((resolve) => {
      this.timeoutId = setTimeout(async () => {
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
 * Create a debounced fetcher for viewport-based requests
 */
export function createDebouncedFetcher<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  options?: DebouncedFetchOptions
): DebouncedFetcher<T> {
  return new DebouncedFetcher(fetchFn, options)
}

/**
 * Fetch markers with debouncing and cancellation
 */
export async function fetchMarkersDebounced(
  url: string,
  signal: AbortSignal,
  options: {
    debounceMs?: number
    timeoutMs?: number
  } = {}
): Promise<{ id: string; title: string; lat: number; lng: number }[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 10000)

  // Combine signals
  const combinedSignal = AbortSignal.any([signal, controller.signal])

  try {
    const response = await fetch(url, { signal: combinedSignal })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[FETCH] Markers fetched', {
        event: 'viewport-fetch',
        url: url.split('?')[0], // Remove query params from log
        items: data.length,
        ms: performance.now()
      })
    }

    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Add viewport padding to bounds for prefetch
 */
export function addViewportPadding(
  bounds: { north: number; south: number; east: number; west: number },
  paddingPercent: number = 0.15
): { north: number; south: number; east: number; west: number } {
  const latPadding = (bounds.north - bounds.south) * paddingPercent
  const lngPadding = (bounds.east - bounds.west) * paddingPercent

  return {
    north: Math.min(90, bounds.north + latPadding),
    south: Math.max(-90, bounds.south - latPadding),
    east: Math.min(180, bounds.east + lngPadding),
    west: Math.max(-180, bounds.west - lngPadding)
  }
}

/**
 * Check if payload size is within limits
 */
export function isPayloadWithinLimits(
  data: any[],
  maxSizeBytes: number = 200 * 1024 // 200KB
): boolean {
  const jsonString = JSON.stringify(data)
  const sizeBytes = new Blob([jsonString]).size
  return sizeBytes <= maxSizeBytes
}

/**
 * Degrade payload by reducing fields if over limit
 */
export function degradePayloadIfNeeded(
  data: { id: string; title: string; lat: number; lng: number; [key: string]: any }[],
  maxSizeBytes: number = 200 * 1024
): { id: string; title: string; lat: number; lng: number }[] {
  if (isPayloadWithinLimits(data, maxSizeBytes)) {
    return data
  }

  // Return minimal fields only
  return data.map(item => ({
    id: item.id,
    title: item.title,
    lat: item.lat,
    lng: item.lng
  }))
}
