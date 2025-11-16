'use client'

import { useState } from 'react'

interface QueueStatus {
  queueLength: number
  redisConfigured: boolean
}

interface JobRunResult {
  success: boolean
  processed: number
  succeeded: number
  failed: number
  byType: Record<string, { succeeded: number; failed: number }>
  queueLength: number
  redisConfigured: boolean
  durationMs?: number
  message?: string
}

export default function JobControls() {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<JobRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/jobs/run')
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.statusText}`)
      }
      const data = await response.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus(null)
    }
  }

  const runJobs = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/admin/jobs/run', {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Failed to run jobs: ${response.statusText}`)
      }

      const data: JobRunResult = await response.json()
      setResult(data)
      setStatus({ queueLength: data.queueLength, redisConfigured: data.redisConfigured })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const enqueueCleanupJob = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/jobs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cleanup:orphaned-data',
          payload: { batchSize: 50 },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Failed to enqueue job: ${response.statusText}`)
      }

      const data = await response.json()
      alert(`Job enqueued successfully! Job ID: ${data.jobId}`)
      await fetchStatus() // Refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const enqueueAnalyticsJob = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/jobs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'analytics:aggregate',
          payload: {}, // Will default to yesterday
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Failed to enqueue job: ${response.statusText}`)
      }

      const data = await response.json()
      alert(`Job enqueued successfully! Job ID: ${data.jobId}`)
      await fetchStatus() // Refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Background Jobs</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Queue Status */}
        <div>
          <div className="flex items-center space-x-4 mb-2">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              Refresh Status
            </button>
          </div>
          {status && (
            <div className="text-sm text-gray-600 space-y-1">
              <p>Queue Length: <strong>{status.queueLength}</strong></p>
              <p>Redis Configured: <strong>{status.redisConfigured ? 'Yes' : 'No'}</strong></p>
            </div>
          )}
        </div>

        {/* Run Jobs */}
        <div>
          <button
            onClick={runJobs}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Run Job Worker (Process Queue)'}
          </button>
          {result && (
            <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
              <p className="font-semibold mb-2">Last Run Results:</p>
              <ul className="space-y-1 text-gray-700">
                <li>Processed: <strong>{result.processed}</strong></li>
                <li>Succeeded: <strong className="text-green-600">{result.succeeded}</strong></li>
                <li>Failed: <strong className="text-red-600">{result.failed}</strong></li>
                {result.durationMs && <li>Duration: <strong>{result.durationMs}ms</strong></li>}
                {Object.keys(result.byType).length > 0 && (
                  <li>
                    <strong>By Type:</strong>
                    <ul className="ml-4 mt-1">
                      {Object.entries(result.byType).map(([type, counts]) => (
                        <li key={type}>
                          {type}: {counts.succeeded} succeeded, {counts.failed} failed
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Enqueue Jobs */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold mb-2">Enqueue Jobs:</p>
          <div className="space-y-2">
            <button
              onClick={enqueueCleanupJob}
              disabled={loading}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 text-sm"
            >
              Enqueue Orphan Cleanup Job
            </button>
            <button
              onClick={enqueueAnalyticsJob}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 text-sm"
            >
              Enqueue Analytics Aggregation Job
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500 mt-4">
          <p>• Jobs are processed in batches of up to 50</p>
          <p>• Each run has a 25-second time limit</p>
          <p>• Failed jobs will retry up to 3 times</p>
          <p>• Jobs expire after 7 days if not processed</p>
        </div>
      </div>
    </div>
  )
}

