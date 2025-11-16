/**
 * HTTP caching utilities for public endpoints
 * Provides consistent cache headers for CDN-friendly responses
 */

import { NextResponse } from 'next/server'

export interface CacheOptions {
  /**
   * Max age in seconds for client-side caching
   * Default: 30 seconds
   */
  maxAge?: number
  
  /**
   * Max age in seconds for CDN/proxy caching
   * Default: 120 seconds (2 minutes)
   */
  sMaxAge?: number
  
  /**
   * Stale-while-revalidate in seconds
   * Allows serving stale content while revalidating in background
   * Default: 60 seconds
   */
  staleWhileRevalidate?: number
  
  /**
   * Whether the response is public (can be cached by CDNs)
   * Default: true
   */
  public?: boolean
  
  /**
   * Additional headers to include
   */
  additionalHeaders?: Record<string, string>
}

/**
 * Add cache headers to a NextResponse for public, cacheable data
 * @param response - The NextResponse to add headers to
 * @param options - Cache configuration options
 * @returns The response with cache headers added
 */
export function addCacheHeaders(
  response: NextResponse,
  options: CacheOptions = {}
): NextResponse {
  const {
    maxAge = 30,
    sMaxAge = 120,
    staleWhileRevalidate = 60,
    public: isPublic = true,
    additionalHeaders = {}
  } = options

  const cacheControlParts: string[] = []
  
  if (isPublic) {
    cacheControlParts.push('public')
  } else {
    cacheControlParts.push('private')
  }
  
  cacheControlParts.push(`max-age=${maxAge}`)
  cacheControlParts.push(`s-maxage=${sMaxAge}`)
  
  if (staleWhileRevalidate > 0) {
    cacheControlParts.push(`stale-while-revalidate=${staleWhileRevalidate}`)
  }

  const cacheControl = cacheControlParts.join(', ')

  // Add cache headers
  response.headers.set('Cache-Control', cacheControl)
  response.headers.set('Vary', 'Accept-Encoding')
  
  // Add any additional headers
  Object.entries(additionalHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

/**
 * Create a cached response for public data
 * Convenience function that creates a JSON response with cache headers
 */
export function cachedJsonResponse(
  data: any,
  options: CacheOptions = {},
  status: number = 200
): NextResponse {
  const response = NextResponse.json(data, { status })
  return addCacheHeaders(response, options)
}


