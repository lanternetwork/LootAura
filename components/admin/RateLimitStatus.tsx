'use client'

import { useState, useEffect } from 'react'

interface RateLimitStatus {
  enabled: boolean
  backend: 'upstash' | 'memory'
  policies: string[]
  recentBlocks: number
}

export default function RateLimitStatus() {
  const [status, setStatus] = useState<RateLimitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Only show in debug mode
    if (process.env.NEXT_PUBLIC_DEBUG !== 'true') {
      setLoading(false)
      return
    }

    // Fetch rate limiting status from performance metrics
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/performance/metrics')
        if (!response.ok) {
          throw new Error('Failed to fetch metrics')
        }
        
        const data = await response.json()
        
        // Extract rate limiting info from metrics
        const rateLimitInfo = data.metrics?.rateLimit || {
          enabled: process.env.NODE_ENV === 'production' && process.env.RATE_LIMITING_ENABLED === 'true',
          backend: process.env.UPSTASH_REDIS_REST_URL ? 'upstash' : 'memory',
          policies: [
            'AUTH_DEFAULT (5/30s)',
            'AUTH_HOURLY (60/3600s)', 
            'GEO_ZIP_SHORT (10/60s)',
            'GEO_ZIP_HOURLY (300/3600s)',
            'SALES_VIEW_30S (20/30s)',
            'SALES_VIEW_HOURLY (800/3600s)',
            'MUTATE_MINUTE (3/60s)',
            'MUTATE_DAILY (100/86400s)',
            'ADMIN_TOOLS (3/30s)',
            'ADMIN_HOURLY (60/3600s)'
          ],
          recentBlocks: 0
        }
        
        setStatus(rateLimitInfo)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

  if (process.env.NEXT_PUBLIC_DEBUG !== 'true') {
    return (
      <div className="text-sm text-gray-500">
        Rate limiting status only available in debug mode
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500">
        Loading rate limiting status...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Error loading status: {error}
      </div>
    )
  }

  if (!status) {
    return (
      <div className="text-sm text-gray-500">
        No rate limiting status available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-medium text-gray-700">Status</div>
          <div className={`text-sm ${status.enabled ? 'text-green-600' : 'text-gray-500'}`}>
            {status.enabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>
        
        <div>
          <div className="text-sm font-medium text-gray-700">Backend</div>
          <div className="text-sm text-gray-600">
            {status.backend === 'upstash' ? 'Upstash Redis' : 'In-Memory'}
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">Active Policies</div>
        <div className="text-xs text-gray-600 space-y-1">
          {status.policies.map((policy, index) => (
            <div key={index} className="font-mono">
              {policy}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700">Recent Blocks</div>
        <div className="text-sm text-gray-600">
          {status.recentBlocks} in last hour
        </div>
      </div>

      <div className="text-xs text-gray-500">
        <p>• Rate limiting is {status.enabled ? 'active' : 'bypassed'} in {process.env.NODE_ENV}</p>
        <p>• Backend: {status.backend === 'upstash' ? 'Production Redis' : 'Development Memory'}</p>
        <p>• Environment: RATE_LIMITING_ENABLED = {process.env.RATE_LIMITING_ENABLED || 'not set'}</p>
      </div>
    </div>
  )
}
