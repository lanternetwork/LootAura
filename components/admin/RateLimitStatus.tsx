'use client'

import { useState, useEffect } from 'react'

interface RateLimitStatusData {
  enabled: boolean
  backend: 'upstash' | 'memory'
  policies: string[]
  recentBlocks: number
}

export default function RateLimitStatus() {
  const [status, setStatus] = useState<RateLimitStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch rate limiting status from performance metrics
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/performance/metrics')
        if (!response.ok) {
          throw new Error('Failed to fetch metrics')
        }
        
        const data = await response.json()
        
        // Extract rate limiting info from metrics
        const rateLimitInfo = data.metrics?.rateLimit
        
        if (!rateLimitInfo) {
          throw new Error('Rate limiting status not available in metrics response')
        }
        
        setStatus({
          enabled: rateLimitInfo.enabled,
          backend: rateLimitInfo.backend === 'unknown' ? 'memory' : rateLimitInfo.backend,
          policies: rateLimitInfo.policies || [],
          recentBlocks: rateLimitInfo.recentBlocks || 0
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

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
        <p>• Rate limiting is {status.enabled ? 'active' : 'bypassed'}</p>
        <p>• Backend: {status.backend === 'upstash' ? 'Production Redis' : 'In-Memory'}</p>
      </div>
    </div>
  )
}
