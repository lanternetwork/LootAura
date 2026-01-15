'use client'

import { useState } from 'react'
import { getCsrfHeaders } from '@/lib/csrf-client'

interface PromotionResult {
  id: string
  sale_id: string
  status: string
  starts_at: string
  ends_at: string
  tier: string
}

export default function TestPromotionTool() {
  const [saleId, setSaleId] = useState('')
  const [mode, setMode] = useState<'seven_days_before_start' | 'now_plus_7' | 'custom'>('seven_days_before_start')
  const [customStartsAt, setCustomStartsAt] = useState('')
  const [customEndsAt, setCustomEndsAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [result, setResult] = useState<PromotionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deactivateResult, setDeactivateResult] = useState<{ count: number } | null>(null)

  const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const activatePromotion = async () => {
    if (!saleId.trim()) {
      setError('Sale ID is required')
      return
    }

    if (mode === 'custom') {
      if (!customStartsAt || !customEndsAt) {
        setError('Custom mode requires both starts_at and ends_at')
        return
      }
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setDeactivateResult(null)

    try {
      const body: any = {
        sale_id: saleId.trim(),
        mode,
        tier: 'featured_week',
      }

      if (mode === 'custom') {
        // Convert local datetime to ISO string
        body.starts_at = new Date(customStartsAt).toISOString()
        body.ends_at = new Date(customEndsAt).toISOString()
      }

      const response = await fetch('/api/admin/promotions/activate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to activate promotion: ${response.statusText}`)
      }

      if (!data.ok || !data.promotion) {
        throw new Error('Invalid response from server')
      }

      setResult(data.promotion)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const deactivatePromotion = async () => {
    if (!saleId.trim()) {
      setError('Sale ID is required')
      return
    }

    setDeactivating(true)
    setError(null)
    setDeactivateResult(null)

    try {
      const response = await fetch('/api/admin/promotions/deactivate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({
          sale_id: saleId.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to deactivate promotion: ${response.statusText}`)
      }

      if (!data.ok) {
        throw new Error('Invalid response from server')
      }

      setDeactivateResult({ count: data.count || 0 })
      setResult(null) // Clear activation result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDeactivating(false)
    }
  }

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString)
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    } catch {
      return dateString
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-2">Test Promotion (No Payment)</h3>
      
      {/* Warning */}
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm font-medium text-yellow-800">
          ⚠️ Admin test tool. No Stripe charge.
        </p>
      </div>

      <div className="space-y-4">
        {/* Sale ID Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sale ID
          </label>
          <input
            type="text"
            value={saleId}
            onChange={(e) => setSaleId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter sale UUID"
          />
        </div>

        {/* Schedule Mode Dropdown */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Schedule Mode
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'seven_days_before_start' | 'now_plus_7' | 'custom')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="seven_days_before_start">7 days before sale start</option>
            <option value="now_plus_7">Now + 7 days</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* Custom Date/Time Inputs */}
        {mode === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Starts At
              </label>
              <input
                type="datetime-local"
                value={customStartsAt}
                onChange={(e) => setCustomStartsAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ends At
              </label>
              <input
                type="datetime-local"
                value={customEndsAt}
                onChange={(e) => setCustomEndsAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={activatePromotion}
            disabled={loading || deactivating}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Activating...' : 'Activate test promotion'}
          </button>
          <button
            onClick={deactivatePromotion}
            disabled={loading || deactivating}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {deactivating ? 'Deactivating...' : 'Deactivate test promotion'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 font-medium">Error:</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Activation Result */}
        {result && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 font-medium mb-3">
              ✅ Promotion activated successfully
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Status:</span> {result.status}
              </div>
              <div>
                <span className="font-medium">Starts:</span> {formatDate(result.starts_at)}
              </div>
              <div>
                <span className="font-medium">Ends:</span> {formatDate(result.ends_at)}
              </div>
              <div>
                <span className="font-medium">Tier:</span> {result.tier}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-green-300">
              <p className="text-sm font-medium text-green-800 mb-2">Quick Links:</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/sales/${result.sale_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Sale
                </a>
                <span className="text-gray-400">•</span>
                <a
                  href="/sales"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Browse Sales
                </a>
                <span className="text-gray-400">•</span>
                <a
                  href="/sales?view=map"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Map
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Deactivation Result */}
        {deactivateResult && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-blue-800 font-medium">
              ✅ Deactivated {deactivateResult.count} promotion{deactivateResult.count !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
