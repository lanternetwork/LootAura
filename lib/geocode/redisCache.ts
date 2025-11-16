/**
 * Redis-backed geocode cache
 * Falls back to in-memory cache if Redis is unavailable
 */

import { ENV_SERVER } from '@/lib/env'

interface CacheEntry {
  result: any
  expiresAt: number
}

// In-memory fallback cache
const memoryCache = new Map<string, CacheEntry>()
const MEMORY_MAX_SIZE = 100

/**
 * Get geocode result from Redis cache
 * Falls back to memory cache if Redis is unavailable
 */
export async function getGeocodeCache(key: string): Promise<any | null> {
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN
  
  // Try Redis first if available
  if (redisUrl && redisToken) {
    try {
      const redisKey = `geocode:${key}`
      const response = await fetch(`${redisUrl}/get`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([redisKey])
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.result) {
          const entry = JSON.parse(data.result) as CacheEntry
          // Check expiration
          if (Date.now() < entry.expiresAt) {
            return entry.result
          } else {
            // Expired, delete from Redis
            await fetch(`${redisUrl}/del`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify([redisKey])
            }).catch(() => {}) // Ignore delete errors
          }
        }
      }
    } catch (error) {
      // Redis failed, fall through to memory cache
    }
  }
  
  // Fallback to memory cache
  const entry = memoryCache.get(key)
  if (entry && Date.now() < entry.expiresAt) {
    return entry.result
  }
  
  if (entry) {
    memoryCache.delete(key) // Remove expired entry
  }
  
  return null
}

/**
 * Set geocode result in Redis cache
 * Falls back to memory cache if Redis is unavailable
 */
export async function setGeocodeCache(
  key: string,
  value: any,
  ttlSeconds: number = 86400 // 24 hours default
): Promise<void> {
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN
  
  const entry: CacheEntry = {
    result: value,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  }
  
  // Try Redis first if available
  if (redisUrl && redisToken) {
    try {
      const redisKey = `geocode:${key}`
      // Set value with expiration using Upstash REST API
      await fetch(`${redisUrl}/set`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([redisKey, JSON.stringify(entry)])
      })
      // Set expiration separately
      await fetch(`${redisUrl}/expire`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([redisKey, ttlSeconds])
      })
      return // Success, don't fall back to memory
    } catch (error) {
      // Redis failed, fall through to memory cache
    }
  }
  
  // Fallback to memory cache
  // Evict oldest if at max size
  if (memoryCache.size >= MEMORY_MAX_SIZE) {
    const firstKey = memoryCache.keys().next().value
    if (firstKey) {
      memoryCache.delete(firstKey)
    }
  }
  
  memoryCache.set(key, entry)
}

/**
 * Clear all geocode cache entries (for testing/admin)
 */
export async function clearGeocodeCache(): Promise<void> {
  memoryCache.clear()
  
  // Optionally clear Redis keys (requires pattern matching which Upstash REST API doesn't support well)
  // For now, we'll just clear memory cache
}

