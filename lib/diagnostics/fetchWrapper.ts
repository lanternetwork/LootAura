'use client'

interface FetchEvent {
  id: string
  endpoint: string
  params: Record<string, string>
  authority: string
  viewportSeq: number
  requestSeq: number
  status: 'pending' | 'success' | 'error'
  size?: number
  timeMs?: number
  timestamp: number
  suppressed?: boolean
}

let eventIdCounter = 0

export function emitFetchEvent(event: Omit<FetchEvent, 'id' | 'timestamp'>) {
  if (typeof window === 'undefined' || !(window as any).__DIAGNOSTIC_FETCH_EVENTS__) {
    return
  }

  const fullEvent: FetchEvent = {
    ...event,
    id: `fetch-${++eventIdCounter}`,
    timestamp: Date.now()
  }

  ;(window as any).__DIAGNOSTIC_FETCH_EVENTS__(fullEvent)
}

export async function diagnosticFetch(
  url: string,
  options: RequestInit = {},
  context: {
    authority: string
    viewportSeq: number
    requestSeq: number
    params?: Record<string, string>
  }
): Promise<Response> {
  const startTime = Date.now()
  const urlObj = new URL(url, window.location.origin)
  const params: Record<string, string> = {}
  
  // Extract query parameters
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value
  })

  // Emit pending event
  emitFetchEvent({
    endpoint: urlObj.pathname,
    params,
    authority: context.authority,
    viewportSeq: context.viewportSeq,
    requestSeq: context.requestSeq,
    status: 'pending'
  })

  try {
    const response = await fetch(url, options)
    const endTime = Date.now()
    
    // Get response size
    const contentLength = response.headers.get('content-length')
    const size = contentLength ? parseInt(contentLength, 10) : undefined

    // Emit success event
    emitFetchEvent({
      endpoint: urlObj.pathname,
      params,
      authority: context.authority,
      viewportSeq: context.viewportSeq,
      requestSeq: context.requestSeq,
      status: 'success',
      size,
      timeMs: endTime - startTime
    })

    return response
  } catch (error) {
    const endTime = Date.now()
    
    // Emit error event
    emitFetchEvent({
      endpoint: urlObj.pathname,
      params,
      authority: context.authority,
      viewportSeq: context.viewportSeq,
      requestSeq: context.requestSeq,
      status: 'error',
      timeMs: endTime - startTime
    })

    throw error
  }
}

export function emitSuppressedFetch(
  endpoint: string,
  params: Record<string, string>,
  context: {
    authority: string
    viewportSeq: number
    requestSeq: number
  }
) {
  emitFetchEvent({
    endpoint,
    params,
    authority: context.authority,
    viewportSeq: context.viewportSeq,
    requestSeq: context.requestSeq,
    status: 'error',
    suppressed: true
  })
}
