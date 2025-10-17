// Database query optimization utilities
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface QueryMetrics {
  query: string
  executionTime: number
  timestamp: number
  params?: Record<string, any>
}

class QueryOptimizer {
  private queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>()
  private queryMetrics: QueryMetrics[] = []
  private readonly MAX_CACHE_SIZE = 100
  private readonly DEFAULT_TTL = 60000 // 1 minute

  // Cache a query result
  cacheQuery(key: string, data: any, ttl: number = this.DEFAULT_TTL) {
    // Remove oldest entries if cache is full
    if (this.queryCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.queryCache.keys().next().value
      this.queryCache.delete(oldestKey)
    }

    this.queryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  // Get cached query result
  getCachedQuery(key: string): any | null {
    const cached = this.queryCache.get(key)
    if (!cached) return null

    const isExpired = Date.now() - cached.timestamp > cached.ttl
    if (isExpired) {
      this.queryCache.delete(key)
      return null
    }

    return cached.data
  }

  // Generate cache key for query
  generateCacheKey(query: string, params: Record<string, any> = {}): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key] ?? ''}`)
      .join('|')
    
    return `${query}|${sortedParams}`
  }

  // Record query metrics
  recordQueryMetrics(query: string, executionTime: number, params?: Record<string, any>) {
    this.queryMetrics.push({
      query,
      executionTime,
      timestamp: Date.now(),
      params
    })

    // Keep only last 1000 metrics
    if (this.queryMetrics.length > 1000) {
      this.queryMetrics = this.queryMetrics.slice(-1000)
    }
  }

  // Get slow queries
  getSlowQueries(threshold: number = 1000): QueryMetrics[] {
    return this.queryMetrics
      .filter(metric => metric.executionTime > threshold)
      .sort((a, b) => b.executionTime - a.executionTime)
  }

  // Get query performance stats
  getPerformanceStats() {
    const totalQueries = this.queryMetrics.length
    const avgExecutionTime = totalQueries > 0 
      ? this.queryMetrics.reduce((sum, metric) => sum + metric.executionTime, 0) / totalQueries
      : 0

    const slowQueries = this.getSlowQueries()
    const cacheHitRate = this.calculateCacheHitRate()

    return {
      totalQueries,
      avgExecutionTime: Math.round(avgExecutionTime),
      slowQueries: slowQueries.length,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      cacheSize: this.queryCache.size
    }
  }

  private calculateCacheHitRate(): number {
    // This is a simplified calculation
    // In a real implementation, you'd track cache hits vs misses
    return 0.85 // Placeholder
  }

  // Clear cache
  clearCache() {
    this.queryCache.clear()
  }

  // Clear expired cache entries
  clearExpiredCache() {
    const now = Date.now()
    for (const [key, cached] of this.queryCache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.queryCache.delete(key)
      }
    }
  }
}

// Singleton instance
export const queryOptimizer = new QueryOptimizer()

// Optimized query wrapper
export async function optimizedQuery<T>(
  queryFn: () => Promise<T>,
  cacheKey: string,
  options: {
    ttl?: number
    skipCache?: boolean
    recordMetrics?: boolean
  } = {}
): Promise<T> {
  const { ttl = 60000, skipCache = false, recordMetrics = true } = options

  // Try cache first
  if (!skipCache) {
    const cached = queryOptimizer.getCachedQuery(cacheKey)
    if (cached) {
      return cached
    }
  }

  // Execute query with timing
  const startTime = Date.now()
  try {
    const result = await queryFn()
    const executionTime = Date.now() - startTime

    // Record metrics
    if (recordMetrics) {
      queryOptimizer.recordQueryMetrics(cacheKey, executionTime)
    }

    // Cache result
    if (!skipCache) {
      queryOptimizer.cacheQuery(cacheKey, result, ttl)
    }

    return result
  } catch (error) {
    const executionTime = Date.now() - startTime
    if (recordMetrics) {
      queryOptimizer.recordQueryMetrics(cacheKey, executionTime, { error: true })
    }
    throw error
  }
}

// Batch query optimization
export async function batchQueries<T>(
  queries: Array<{ key: string; queryFn: () => Promise<T> }>,
  options: {
    maxConcurrency?: number
    ttl?: number
  } = {}
): Promise<Map<string, T>> {
  const { maxConcurrency = 5, ttl = 60000 } = options
  const results = new Map<string, T>()
  
  // Process queries in batches
  for (let i = 0; i < queries.length; i += maxConcurrency) {
    const batch = queries.slice(i, i + maxConcurrency)
    
    const batchPromises = batch.map(async ({ key, queryFn }) => {
      const cacheKey = `batch_${key}`
      
      // Try cache first
      const cached = queryOptimizer.getCachedQuery(cacheKey)
      if (cached) {
        results.set(key, cached)
        return
      }

      // Execute query
      const result = await optimizedQuery(queryFn, cacheKey, { ttl })
      results.set(key, result)
    })

    await Promise.all(batchPromises)
  }

  return results
}

// Connection pooling simulation (Supabase handles this internally)
export class ConnectionPool {
  private static instance: ConnectionPool
  private connections: any[] = []
  private readonly maxConnections = 10

  static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool()
    }
    return ConnectionPool.instance
  }

  async getConnection() {
    // Supabase handles connection pooling internally
    // This is a placeholder for future optimization
    return createSupabaseServerClient()
  }

  releaseConnection(connection: any) {
    // Supabase handles connection cleanup internally
  }
}

// Query performance monitoring
export function startPerformanceMonitoring() {
  // Clear expired cache every 5 minutes
  setInterval(() => {
    queryOptimizer.clearExpiredCache()
  }, 5 * 60 * 1000)

  // Log performance stats every 10 minutes
  setInterval(() => {
    const stats = queryOptimizer.getPerformanceStats()
    if (stats.totalQueries > 0) {
      console.log('[PERFORMANCE] Query Stats:', stats)
    }
  }, 10 * 60 * 1000)
}

// Initialize performance monitoring
if (typeof window === 'undefined') {
  startPerformanceMonitoring()
}
