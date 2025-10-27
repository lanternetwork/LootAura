'use client'

import { useState, useEffect } from 'react'
import { authDebug } from '@/lib/debug/authDebug'

interface PerformanceMetrics {
  database: {
    connectionPool: number
    queryTime: number
    slowQueries: number
    indexUsage: any[]
  }
  api: {
    responseTime: number
    errorRate: number
    throughput: number
  }
  memory: {
    heapUsed: number
    heapTotal: number
    external: number
  }
  timestamp: string
}

export default function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/performance/metrics')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch metrics')
      }

      setMetrics(data.metrics)
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        authDebug.log('Performance metrics fetched', data.metrics)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        authDebug.logAuthError('performance-metrics-fetch', err)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Only show in debug mode
    if (process.env.NEXT_PUBLIC_DEBUG !== 'true' && process.env.NODE_ENV !== 'development') {
      return
    }

    // Fetch metrics on mount
    fetchMetrics()

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000)

    return () => clearInterval(interval)
  }, [])

  // Don't render if not in debug mode
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true' && process.env.NODE_ENV !== 'development') {
    return null
  }

  const getStatusColor = (value: number, thresholds: { warning: number; critical: number }) => {
    if (value >= thresholds.critical) return 'text-red-400'
    if (value >= thresholds.warning) return 'text-yellow-400'
    return 'text-green-400'
  }

  const getStatusIcon = (value: number, thresholds: { warning: number; critical: number }) => {
    if (value >= thresholds.critical) return '🔴'
    if (value >= thresholds.warning) return '🟡'
    return '🟢'
  }

  return (
    <>
      {/* Performance Monitor Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-4 left-4 z-50 bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-mono hover:bg-blue-700 transition-colors"
        title="Toggle Performance Monitor"
      >
        📊 PERF MONITOR
      </button>

      {/* Performance Monitor Dashboard */}
      {isVisible && (
        <div className="fixed bottom-16 left-4 z-50 bg-black text-green-400 p-4 rounded-lg max-w-md max-h-96 overflow-auto text-xs font-mono border border-blue-500">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-blue-400 font-bold">📊 PERFORMANCE MONITOR</h3>
            <div className="flex gap-2">
              <button
                onClick={fetchMetrics}
                disabled={isLoading}
                className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? '⏳' : '🔄'}
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          </div>

          {error && (
            <div className="text-red-400 mb-2 p-2 bg-red-900 rounded">
              ❌ Error: {error}
            </div>
          )}

          {metrics && (
            <div className="space-y-3">
              {/* Database Metrics */}
              <div>
                <h4 className="text-yellow-400 font-bold">🗄️ Database</h4>
                <div className="ml-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Query Time:</span>
                    <span className={getStatusColor(metrics.database.queryTime, { warning: 500, critical: 1000 })}>
                      {getStatusIcon(metrics.database.queryTime, { warning: 500, critical: 1000 })} {metrics.database.queryTime}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Connections:</span>
                    <span className={getStatusColor(metrics.database.connectionPool, { warning: 8, critical: 10 })}>
                      {getStatusIcon(metrics.database.connectionPool, { warning: 8, critical: 10 })} {metrics.database.connectionPool}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Slow Queries:</span>
                    <span className={getStatusColor(metrics.database.slowQueries, { warning: 5, critical: 10 })}>
                      {getStatusIcon(metrics.database.slowQueries, { warning: 5, critical: 10 })} {metrics.database.slowQueries}
                    </span>
                  </div>
                </div>
              </div>

              {/* API Metrics */}
              <div>
                <h4 className="text-yellow-400 font-bold">🌐 API</h4>
                <div className="ml-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Response Time:</span>
                    <span className={getStatusColor(metrics.api.responseTime, { warning: 300, critical: 500 })}>
                      {getStatusIcon(metrics.api.responseTime, { warning: 300, critical: 500 })} {metrics.api.responseTime}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Error Rate:</span>
                    <span className={getStatusColor(metrics.api.errorRate * 100, { warning: 2, critical: 5 })}>
                      {getStatusIcon(metrics.api.errorRate * 100, { warning: 2, critical: 5 })} {(metrics.api.errorRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Throughput:</span>
                    <span className="text-green-400">
                      🟢 {metrics.api.throughput}/min
                    </span>
                  </div>
                </div>
              </div>

              {/* Memory Metrics */}
              <div>
                <h4 className="text-yellow-400 font-bold">💾 Memory</h4>
                <div className="ml-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Heap Used:</span>
                    <span className={getStatusColor(metrics.memory.heapUsed, { warning: 200, critical: 400 })}>
                      {getStatusIcon(metrics.memory.heapUsed, { warning: 200, critical: 400 })} {metrics.memory.heapUsed}MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Heap Total:</span>
                    <span className="text-green-400">
                      🟢 {metrics.memory.heapTotal}MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>External:</span>
                    <span className="text-green-400">
                      🟢 {metrics.memory.external}MB
                    </span>
                  </div>
                </div>
              </div>

              {/* Timestamp */}
              <div className="pt-2 border-t border-blue-500 text-xs text-gray-400">
                Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-blue-500">
                <button
                  onClick={() => {
                    console.log('📊 PERFORMANCE METRICS:', metrics)
                  }}
                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                >
                  Log to Console
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
