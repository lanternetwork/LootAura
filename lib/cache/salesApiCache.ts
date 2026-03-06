/**
 * Short-TTL server cache for public GET /api/sales responses.
 * Used only for non-user-scoped requests (no favorites-only).
 * Prefers Upstash Redis when available; falls back to in-process memory (serverless-safe).
 */

import { ENV_SERVER } from '@/lib/env'
import { getNormalizedBboxKey, type Bounds } from '@/lib/map/bounds'

const BOUNDS_PRECISION = 4
const MEMORY_MAX_SIZE = 200
const DEFAULT_TTL_SECONDS = 45

interface CacheEntry {
  response: unknown
  expiresAt: number
}

const memoryCache = new Map<string, CacheEntry>()

export interface SalesCacheKeyParams {
  /** Bbox mode: normalized bounds. Mutually exclusive with near params. */
  actualBbox: Bounds | null
  /** Near mode: lat, lng, radiusKm. Used when actualBbox is null. */
  nearLat?: number
  nearLng?: number
  radiusKm?: number
  dateRange: string
  startDateParam: string | null
  endDateParam: string | null
  categories: string[]
  limit: number
  offset: number
  distanceKm: number
  q: string | null
}

/**
 * Build a stable cache key from normalized public request params.
 * Different bounds/filters must produce different keys.
 */
export function buildSalesCacheKey(params: SalesCacheKeyParams): string {
  const parts: string[] = []
  if (params.actualBbox) {
    parts.push('bbox:' + getNormalizedBboxKey(params.actualBbox, BOUNDS_PRECISION))
  } else {
    const lat = params.nearLat ?? 0
    const lng = params.nearLng ?? 0
    const p = Math.pow(10, BOUNDS_PRECISION)
    parts.push('near:' + [Math.round(lat * p) / p, Math.round(lng * p) / p, params.radiusKm ?? 0].join(','))
  }
  parts.push('dr:' + (params.dateRange || 'any'))
  parts.push('from:' + (params.startDateParam ?? ''))
  parts.push('to:' + (params.endDateParam ?? ''))
  parts.push('cat:' + [...params.categories].sort().join(','))
  parts.push('limit:' + params.limit)
  parts.push('offset:' + params.offset)
  parts.push('dist:' + (params.distanceKm ?? 0))
  parts.push('q:' + (params.q ?? ''))
  return parts.join('|')
}

/**
 * Get cached response for a public sales request. Returns null on miss or expiry.
 */
export async function getSalesApiCache(key: string): Promise<unknown | null> {
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN

  if (redisUrl && redisToken) {
    try {
      const redisKey = `sales:${key}`
      const res = await fetch(`${redisUrl}/get`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([redisKey]),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.result) {
          const entry = JSON.parse(data.result) as CacheEntry
          if (Date.now() < entry.expiresAt) return entry.response
        }
      }
    } catch {
      // fall through to memory
    }
  }

  const entry = memoryCache.get(key)
  if (entry && Date.now() < entry.expiresAt) return entry.response
  if (entry) memoryCache.delete(key)
  return null
}

/**
 * Store response in cache with TTL. Safe in serverless (memory is per-instance).
 */
export async function setSalesApiCache(
  key: string,
  response: unknown,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN
  const entry: CacheEntry = {
    response,
    expiresAt: Date.now() + ttlSeconds * 1000,
  }

  if (redisUrl && redisToken) {
    try {
      const redisKey = `sales:${key}`
      await fetch(`${redisUrl}/set`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([redisKey, JSON.stringify(entry)]),
      })
      await fetch(`${redisUrl}/expire`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([redisKey, ttlSeconds]),
      })
      return
    } catch {
      // fall through to memory
    }
  }

  if (memoryCache.size >= MEMORY_MAX_SIZE) {
    const firstKey = memoryCache.keys().next().value
    if (firstKey) memoryCache.delete(firstKey)
  }
  memoryCache.set(key, entry)
}

/** Clear in-memory sales cache (for tests). Does not clear Redis. */
export function clearSalesApiMemoryCache(): void {
  memoryCache.clear()
}
