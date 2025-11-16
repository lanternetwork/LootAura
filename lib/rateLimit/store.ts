/**
 * Rate Limiting Store
 * 
 * Provides sliding window counter storage with Redis fallback to in-memory.
 * Uses Upstash Redis REST API when available, otherwise in-memory Map.
 */

interface WindowCount {
  count: number
  resetAt: number
}

// In-memory store for dev/test
const memoryStore = new Map<string, WindowCount>()

// Maximum size for in-memory store (to prevent unbounded growth)
const MAX_MEMORY_STORE_SIZE = 10000

// Clean up expired entries every 5 minutes
setInterval(() => {
  const currentTime = Math.floor(Date.now() / 1000)
  for (const [key, entry] of memoryStore.entries()) {
    if (currentTime > entry.resetAt) {
      memoryStore.delete(key)
    }
  }
  
  // If still over max size after cleanup, evict oldest entries (FIFO)
  if (memoryStore.size > MAX_MEMORY_STORE_SIZE) {
    const entriesToRemove = memoryStore.size - MAX_MEMORY_STORE_SIZE
    let removed = 0
    for (const key of memoryStore.keys()) {
      if (removed >= entriesToRemove) break
      memoryStore.delete(key)
      removed++
    }
  }
}, 5 * 60 * 1000)

export function now(): number {
  return Math.floor(Date.now() / 1000)
}

async function incrAndGetRedis(windowKey: string, windowSec: number): Promise<WindowCount> {
  const { ENV_SERVER } = await import('@/lib/env')
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN
  
  if (!redisUrl || !redisToken) {
    // Return a special error that can be caught for fallback
    throw new Error('REDIS_NOT_CONFIGURED')
  }
  
  const currentTime = now()
  const windowStart = currentTime - (currentTime % windowSec)
  const redisKey = `rate_limit:${windowKey}:${windowStart}`
  
  try {
    // Use Upstash REST API
    const response = await fetch(`${redisUrl}/incr`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([redisKey])
    })
    
    if (!response.ok) {
      throw new Error(`Redis request failed: ${response.status}`)
    }
    
    const data = await response.json()
    const count = data.result as number
    
    // Set expiration
    await fetch(`${redisUrl}/expire`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([redisKey, windowSec])
    })
    
    return {
      count,
      resetAt: windowStart + windowSec
    }
  } catch (error) {
    console.warn('[RATE_LIMIT] Redis error, falling back to memory:', error)
    throw error
  }
}

async function incrAndGetMemory(windowKey: string, windowSec: number): Promise<WindowCount> {
  const currentTime = now()
  const windowStart = currentTime - (currentTime % windowSec)
  const memoryKey = `${windowKey}:${windowStart}`
  
  const existing = memoryStore.get(memoryKey)
  if (existing && currentTime < existing.resetAt) {
    existing.count++
    return existing
  }
  
  const newEntry: WindowCount = {
    count: 1,
    resetAt: windowStart + windowSec
  }
  
  memoryStore.set(memoryKey, newEntry)
  return newEntry
}

export async function incrAndGet(windowKey: string, windowSec: number): Promise<WindowCount> {
  // Try Redis first if credentials are available
  const { ENV_SERVER } = await import('@/lib/env')
  if (ENV_SERVER.UPSTASH_REDIS_REST_URL && ENV_SERVER.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await incrAndGetRedis(windowKey, windowSec)
    } catch (error) {
      // Fall back to memory on Redis error or missing credentials
      if (error instanceof Error && error.message === 'REDIS_NOT_CONFIGURED') {
        console.warn('[RATE_LIMIT] Redis credentials not configured, using memory store')
      } else {
        console.warn('[RATE_LIMIT] Redis error, falling back to memory:', error)
      }
      return await incrAndGetMemory(windowKey, windowSec)
    }
  }
  
  // Use memory store for dev/test
  return await incrAndGetMemory(windowKey, windowSec)
}
