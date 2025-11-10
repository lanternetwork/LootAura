'use client'

import { useState, useEffect } from 'react'
import { toast } from 'react-toastify'

interface AnalyticsSummary {
  ok: boolean
  meta: {
    tableExists: boolean
    rlsReadable: boolean
    lastEventAt?: string
  }
  range: {
    from: string
    to: string
    days: number
  }
  totals: {
    view: number
    save: number
    click: number
    share: number
    favorite: number
  }
  series: Array<{
    date: string
    view: number
    save: number
    click: number
    share: number
    favorite: number
  }>
}

export default function AnalyticsDiagnosticsCard() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [seeding, setSeeding] = useState(false)
  const [purging, setPurging] = useState(false)
  const [showSeedDialog, setShowSeedDialog] = useState(false)
  const [seedPerDay, setSeedPerDay] = useState(50)

  // Auto-fetch on mount and when days changes
  useEffect(() => {
    fetchSummary()
  }, [days])

  const fetchSummary = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/analytics/summary?days=${days}`)
      if (!response.ok) {
        let errorMessage = 'Failed to fetch analytics summary'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.status === 403 
            ? 'Forbidden: Admin access required' 
            : response.status === 401
            ? 'Unauthorized: Please sign in'
            : `Failed to fetch analytics summary (${response.status})`
        }
        throw new Error(errorMessage)
      }
      const data = await response.json()
      setSummary(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const response = await fetch('/api/admin/analytics/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: 7,
          perDay: seedPerDay,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to seed events'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.status === 400
            ? 'Bad request: Check if analytics table exists'
            : `Failed to seed events (${response.status})`
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      toast.success(`Seeded ${data.inserted} test events`)
      setShowSeedDialog(false)
      await fetchSummary()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to seed events'
      toast.error(errorMessage)
    } finally {
      setSeeding(false)
    }
  }

  const handlePurge = async () => {
    if (!confirm('Are you sure you want to purge all test events?')) {
      return
    }

    setPurging(true)
    try {
      const response = await fetch('/api/admin/analytics/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error('Failed to purge events')
      }

      const data = await response.json()
      toast.success(`Purged ${data.deleted} test events`)
      await fetchSummary()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to purge events')
    } finally {
      setPurging(false)
    }
  }

  const formatTimeAgo = (timestamp?: string) => {
    if (!timestamp) return '—'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const getMaxValue = () => {
    if (!summary) return 1
    return Math.max(
      ...summary.series.map(s => s.view + s.save + s.click + s.share + s.favorite),
      1
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Analytics Diagnostics</h3>

      {/* Status Row */}
      {loading ? (
        <div className="text-sm text-gray-500 mb-4">Loading analytics status...</div>
      ) : error ? (
        <div className="text-sm text-red-600 mb-4">Error: {error}</div>
      ) : summary ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                summary.meta.tableExists
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              Table: {summary.meta.tableExists ? 'OK' : 'Not Found'}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                summary.meta.rlsReadable
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              RLS: {summary.meta.rlsReadable ? 'OK' : 'Fail'}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              Last Event: {formatTimeAgo(summary.meta.lastEventAt)}
            </span>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{summary.totals.view}</div>
              <div className="text-xs text-gray-600">Views</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{summary.totals.save}</div>
              <div className="text-xs text-gray-600">Saves</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{summary.totals.click}</div>
              <div className="text-xs text-gray-600">Clicks</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{summary.totals.share}</div>
              <div className="text-xs text-gray-600">Shares</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{summary.totals.favorite}</div>
              <div className="text-xs text-gray-600">Favorites</div>
            </div>
          </div>

          {/* Simple Chart */}
          {summary.series.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Event Timeline (Last {days} days)</div>
              <div className="space-y-1">
                {summary.series.map((day, idx) => {
                  const total = day.view + day.save + day.click + day.share + day.favorite
                  const maxValue = getMaxValue()
                  const percentage = (total / maxValue) * 100

                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="text-xs text-gray-600 w-20">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex-1 bg-gray-200 rounded h-6 relative overflow-hidden">
                        <div className="absolute inset-0 flex">
                          <div
                            className="bg-blue-500"
                            style={{ width: `${(day.view / total) * percentage}%` }}
                            title={`Views: ${day.view}`}
                          />
                          <div
                            className="bg-green-500"
                            style={{ width: `${(day.save / total) * percentage}%` }}
                            title={`Saves: ${day.save}`}
                          />
                          <div
                            className="bg-yellow-500"
                            style={{ width: `${(day.click / total) * percentage}%` }}
                            title={`Clicks: ${day.click}`}
                          />
                          <div
                            className="bg-purple-500"
                            style={{ width: `${(day.share / total) * percentage}%` }}
                            title={`Shares: ${day.share}`}
                          />
                          <div
                            className="bg-pink-500"
                            style={{ width: `${(day.favorite / total) * percentage}%` }}
                            title={`Favorites: ${day.favorite}`}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 w-12 text-right">{total}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Days:</label>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value={7}>7</option>
                <option value={14}>14</option>
                <option value={30}>30</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSeedDialog(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Seed Test Events
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {purging ? 'Purging...' : 'Purge Test'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Seed Dialog */}
      {showSeedDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h4 className="text-lg font-semibold mb-4">Seed Test Events</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Events per day:
                </label>
                <input
                  type="number"
                  value={seedPerDay}
                  onChange={(e) => setSeedPerDay(parseInt(e.target.value) || 50)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  min="1"
                  max="1000"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowSeedDialog(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {seeding ? 'Seeding...' : 'Seed'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

