/**
 * Empty stub for lib/performance modules
 * Prevents background monitoring/workers from being created
 */

// Stub queryOptimizer
export const queryOptimizer = {
  cacheQuery: () => {},
  getCachedQuery: () => null,
  recordQuery: () => {},
  getQueryStats: () => ({ totalQueries: 0, avgExecutionTime: 0, cacheHits: 0, cacheMisses: 0 }),
}

// Stub monitoring
export const performanceMonitor = {
  recordMetric: () => {},
  getMetrics: () => [],
  getAlerts: () => [],
  getSummary: () => ({
    avgPageLoadTime: 0,
    avgApiResponseTime: 0,
    avgDatabaseQueryTime: 0,
    avgCacheHitRate: 0,
    avgMemoryUsage: 0,
  }),
  getRecommendations: () => [],
}

