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

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = now()
  for (const [key, entry] of memoryStore.entries()) {
    if (now > entry.resetAt) {
      memoryStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

export function now(): number {
  return Math.floor(Date.now() / 1000)
}

async function incrAndGetRedis(windowKey: string, windowSec: number): Promise<WindowCount> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!redisUrl || !redisToken) {
    throw new Error('Redis credentials not configured')
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
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await incrAndGetRedis(windowKey, windowSec)
    } catch (error) {
      // Fall back to memory on Redis error
      return await incrAndGetMemory(windowKey, windowSec)
    }
  }
  
  // Use memory store for dev/test
  return await incrAndGetMemory(windowKey, windowSec)
}
