// Performance monitoring and alerting system
import { queryOptimizer } from './queryOptimizer'

interface PerformanceMetrics {
  timestamp: number
  pageLoadTime: number
  apiResponseTime: number
  databaseQueryTime: number
  cacheHitRate: number
  memoryUsage: number
  bundleSize: number
}

interface PerformanceAlert {
  type: 'slow_query' | 'high_memory' | 'slow_api' | 'low_cache_hit'
  severity: 'warning' | 'error' | 'critical'
  message: string
  timestamp: number
  metrics: PerformanceMetrics
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = []
  private alerts: PerformanceAlert[] = []
  private readonly MAX_METRICS = 1000
  private readonly MAX_ALERTS = 100

  // Performance thresholds
  private readonly THRESHOLDS = {
    SLOW_QUERY_MS: 1000,
    SLOW_API_MS: 500,
    HIGH_MEMORY_MB: 100,
    LOW_CACHE_HIT_RATE: 0.7,
    SLOW_PAGE_LOAD_MS: 3000
  }

  // Record performance metrics
  recordMetrics(metrics: Partial<PerformanceMetrics>) {
    const fullMetrics: PerformanceMetrics = {
      timestamp: Date.now(),
      pageLoadTime: 0,
      apiResponseTime: 0,
      databaseQueryTime: 0,
      cacheHitRate: 0,
      memoryUsage: 0,
      bundleSize: 0,
      ...metrics
    }

    this.metrics.push(fullMetrics)

    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS)
    }

    // Check for performance issues
    this.checkPerformanceIssues(fullMetrics)
  }

  // Check for performance issues and create alerts
  private checkPerformanceIssues(metrics: PerformanceMetrics) {
    const issues: PerformanceAlert[] = []

    // Slow database queries
    if (metrics.databaseQueryTime > this.THRESHOLDS.SLOW_QUERY_MS) {
      issues.push({
        type: 'slow_query',
        severity: 'warning',
        message: `Slow database query: ${metrics.databaseQueryTime}ms`,
        timestamp: Date.now(),
        metrics
      })
    }

    // Slow API responses
    if (metrics.apiResponseTime > this.THRESHOLDS.SLOW_API_MS) {
      issues.push({
        type: 'slow_api',
        severity: 'warning',
        message: `Slow API response: ${metrics.apiResponseTime}ms`,
        timestamp: Date.now(),
        metrics
      })
    }

    // High memory usage
    if (metrics.memoryUsage > this.THRESHOLDS.HIGH_MEMORY_MB) {
      issues.push({
        type: 'high_memory',
        severity: 'error',
        message: `High memory usage: ${metrics.memoryUsage}MB`,
        timestamp: Date.now(),
        metrics
      })
    }

    // Low cache hit rate
    if (metrics.cacheHitRate < this.THRESHOLDS.LOW_CACHE_HIT_RATE) {
      issues.push({
        type: 'low_cache_hit',
        severity: 'warning',
        message: `Low cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`,
        timestamp: Date.now(),
        metrics
      })
    }

    // Add alerts
    issues.forEach(alert => this.addAlert(alert))
  }

  // Add performance alert
  private addAlert(alert: PerformanceAlert) {
    this.alerts.push(alert)

    // Keep only recent alerts
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS)
    }

    // Log critical alerts
    if (alert.severity === 'critical') {
      console.error('[PERFORMANCE ALERT]', alert)
    } else if (alert.severity === 'error') {
      console.warn('[PERFORMANCE ALERT]', alert)
    }
  }

  // Get performance summary
  getPerformanceSummary() {
    const recentMetrics = this.metrics.slice(-100) // Last 100 metrics
    if (recentMetrics.length === 0) {
      return {
        avgPageLoadTime: 0,
        avgApiResponseTime: 0,
        avgDatabaseQueryTime: 0,
        avgCacheHitRate: 0,
        avgMemoryUsage: 0,
        totalAlerts: this.alerts.length,
        recentAlerts: this.alerts.slice(-10)
      }
    }

    const avgPageLoadTime = recentMetrics.reduce((sum, m) => sum + m.pageLoadTime, 0) / recentMetrics.length
    const avgApiResponseTime = recentMetrics.reduce((sum, m) => sum + m.apiResponseTime, 0) / recentMetrics.length
    const avgDatabaseQueryTime = recentMetrics.reduce((sum, m) => sum + m.databaseQueryTime, 0) / recentMetrics.length
    const avgCacheHitRate = recentMetrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / recentMetrics.length
    const avgMemoryUsage = recentMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / recentMetrics.length

    return {
      avgPageLoadTime: Math.round(avgPageLoadTime),
      avgApiResponseTime: Math.round(avgApiResponseTime),
      avgDatabaseQueryTime: Math.round(avgDatabaseQueryTime),
      avgCacheHitRate: Math.round(avgCacheHitRate * 100) / 100,
      avgMemoryUsage: Math.round(avgMemoryUsage),
      totalAlerts: this.alerts.length,
      recentAlerts: this.alerts.slice(-10)
    }
  }

  // Get alerts by type
  getAlertsByType(type: PerformanceAlert['type']) {
    return this.alerts.filter(alert => alert.type === type)
  }

  // Get alerts by severity
  getAlertsBySeverity(severity: PerformanceAlert['severity']) {
    return this.alerts.filter(alert => alert.severity === severity)
  }

  // Clear old alerts
  clearOldAlerts(maxAge: number = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoff = Date.now() - maxAge
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff)
  }

  // Get performance trends
  getPerformanceTrends() {
    const metrics = this.metrics.slice(-50) // Last 50 metrics
    if (metrics.length < 2) return null

    const trends = {
      pageLoadTime: this.calculateTrend(metrics.map(m => m.pageLoadTime)),
      apiResponseTime: this.calculateTrend(metrics.map(m => m.apiResponseTime)),
      databaseQueryTime: this.calculateTrend(metrics.map(m => m.databaseQueryTime)),
      cacheHitRate: this.calculateTrend(metrics.map(m => m.cacheHitRate)),
      memoryUsage: this.calculateTrend(metrics.map(m => m.memoryUsage))
    }

    return trends
  }

  private calculateTrend(values: number[]): 'improving' | 'degrading' | 'stable' {
    if (values.length < 2) return 'stable'

    const firstHalf = values.slice(0, Math.floor(values.length / 2))
    const secondHalf = values.slice(Math.floor(values.length / 2))

    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length

    const change = (secondAvg - firstAvg) / firstAvg

    if (change > 0.1) return 'degrading'
    if (change < -0.1) return 'improving'
    return 'stable'
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor()

// Web Vitals monitoring
export function monitorWebVitals() {
  if (typeof window === 'undefined') return

  // Monitor Core Web Vitals
  import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
    getCLS((metric) => {
      performanceMonitor.recordMetrics({
        pageLoadTime: metric.value * 1000, // Convert to ms
        bundleSize: 0 // Placeholder
      })
    })

    getFID((metric) => {
      performanceMonitor.recordMetrics({
        pageLoadTime: metric.value,
        bundleSize: 0
      })
    })

    getFCP((metric) => {
      performanceMonitor.recordMetrics({
        pageLoadTime: metric.value,
        bundleSize: 0
      })
    })

    getLCP((metric) => {
      performanceMonitor.recordMetrics({
        pageLoadTime: metric.value,
        bundleSize: 0
      })
    })

    getTTFB((metric) => {
      performanceMonitor.recordMetrics({
        apiResponseTime: metric.value,
        bundleSize: 0
      })
    })
  })
}

// API performance monitoring
export function monitorApiPerformance() {
  if (typeof window === 'undefined') return

  // Override fetch to monitor API calls
  const originalFetch = window.fetch
  window.fetch = async (...args) => {
    const startTime = Date.now()
    
    try {
      const response = await originalFetch(...args)
      const endTime = Date.now()
      
      performanceMonitor.recordMetrics({
        apiResponseTime: endTime - startTime,
        bundleSize: 0
      })
      
      return response
    } catch (error) {
      const endTime = Date.now()
      
      performanceMonitor.recordMetrics({
        apiResponseTime: endTime - startTime,
        bundleSize: 0
      })
      
      throw error
    }
  }
}

// Memory monitoring
let memoryIntervalId: ReturnType<typeof setInterval> | null = null

export function monitorMemoryUsage() {
  if (typeof window === 'undefined') return

  // Clear existing interval if any (prevent duplicates)
  if (memoryIntervalId) {
    clearInterval(memoryIntervalId)
    memoryIntervalId = null
  }

  memoryIntervalId = setInterval(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      const usedMB = memory.usedJSHeapSize / 1024 / 1024
      
      performanceMonitor.recordMetrics({
        memoryUsage: usedMB,
        bundleSize: 0
      })
    }
  }, 30000) // Every 30 seconds
}

export function stopMemoryMonitoring() {
  if (memoryIntervalId) {
    clearInterval(memoryIntervalId)
    memoryIntervalId = null
  }
}

// Initialize monitoring
let alertsIntervalId: ReturnType<typeof setInterval> | null = null

export function initializePerformanceMonitoring() {
  if (typeof window === 'undefined') return

  monitorWebVitals()
  monitorApiPerformance()
  monitorMemoryUsage()

  // Clear existing interval if any (prevent duplicates)
  if (alertsIntervalId) {
    clearInterval(alertsIntervalId)
    alertsIntervalId = null
  }

  // Clear old alerts every hour
  alertsIntervalId = setInterval(() => {
    performanceMonitor.clearOldAlerts()
  }, 60 * 60 * 1000)
}

export function stopPerformanceMonitoring() {
  stopMemoryMonitoring()
  if (alertsIntervalId) {
    clearInterval(alertsIntervalId)
    alertsIntervalId = null
  }
}

// Performance dashboard data
export function getPerformanceDashboard() {
  const summary = performanceMonitor.getPerformanceSummary()
  const trends = performanceMonitor.getPerformanceTrends()
  const queryStats = queryOptimizer.getPerformanceStats()

  return {
    summary,
    trends,
    queryStats,
    alerts: performanceMonitor.getAlertsBySeverity('error').slice(-5),
    recommendations: generateRecommendations(summary, trends)
  }
}

function generateRecommendations(summary: any, trends: any) {
  const recommendations: string[] = []

  if (summary.avgPageLoadTime > 2000) {
    recommendations.push('Consider implementing code splitting and lazy loading')
  }

  if (summary.avgApiResponseTime > 500) {
    recommendations.push('Optimize API endpoints and add caching')
  }

  if (summary.avgDatabaseQueryTime > 1000) {
    recommendations.push('Add database indexes and optimize queries')
  }

  if (summary.avgCacheHitRate < 0.8) {
    recommendations.push('Improve caching strategy and increase cache TTL')
  }

  if (summary.avgMemoryUsage > 50) {
    recommendations.push('Optimize memory usage and implement garbage collection')
  }

  if (trends?.pageLoadTime === 'degrading') {
    recommendations.push('Page load performance is degrading - investigate recent changes')
  }

  return recommendations
}
