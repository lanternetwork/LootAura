'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCsrfHeaders } from '@/lib/csrf-client'
import { toast } from 'react-toastify'

interface ArchiveStatus {
  ok: boolean
  statistics: {
    totalArchived: number
    recentlyArchived: number
    pendingArchive: number
    totalActive: number
  }
  pendingSales: Array<{
    id: string
    title: string
    date_end: string | null
    date_start: string
  }>
}

interface ArchiveResult {
  ok: boolean
  runAt: string
  archived: number
  errors: number
  message?: string
  salesArchived?: Array<{
    id: string
    title: string
    date_end: string | null
  }>
}

async function fetchArchiveStatus(): Promise<ArchiveStatus> {
  const response = await fetch('/api/admin/archive/status', {
    credentials: 'include',
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch archive status' }))
    throw new Error(errorData.error || 'Failed to fetch archive status')
  }

  return response.json()
}

async function triggerArchive(): Promise<ArchiveResult> {
  const response = await fetch('/api/admin/archive/trigger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getCsrfHeaders(),
    },
    credentials: 'include',
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to trigger archive' }))
    throw new Error(errorData.error || 'Failed to trigger archive')
  }

  return response.json()
}

export default function ArchiveControlPanel() {
  const queryClient = useQueryClient()
  const [lastRun, setLastRun] = useState<ArchiveResult | null>(null)

  const { data: status, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ['admin-archive-status'],
    queryFn: fetchArchiveStatus,
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  const triggerMutation = useMutation({
    mutationFn: triggerArchive,
    onSuccess: (data) => {
      setLastRun(data)
      queryClient.invalidateQueries({ queryKey: ['admin-archive-status'] })
      if (data.ok) {
        toast.success(`Archive completed: ${data.archived} sales archived`)
      } else {
        toast.error('Archive failed: ' + (data.message || 'Unknown error'))
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to trigger archive: ' + error.message)
    },
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Archive System Control</h2>
        <button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
        >
          {triggerMutation.isPending ? 'Running...' : 'Run Archive Now'}
        </button>
      </div>

      {/* Last Run Result */}
      {lastRun && (
        <div className={`mb-4 p-4 rounded-lg ${
          lastRun.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-medium ${
              lastRun.ok ? 'text-green-800' : 'text-red-800'
            }`}>
              {lastRun.ok ? '✓ Last Run Successful' : '✗ Last Run Failed'}
            </span>
            <span className="text-xs text-gray-500">
              {formatDate(lastRun.runAt)}
            </span>
          </div>
          {lastRun.ok ? (
            <div className="text-sm text-green-700">
              <p>Archived {lastRun.archived} sales</p>
              {lastRun.message && <p className="mt-1">{lastRun.message}</p>}
              {lastRun.salesArchived && lastRun.salesArchived.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-green-600 hover:text-green-700">
                    View archived sales ({lastRun.salesArchived.length})
                  </summary>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    {lastRun.salesArchived.map((sale) => (
                      <li key={sale.id} className="text-xs">
                        {sale.title}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <div className="text-sm text-red-700">
              <p>Error: {lastRun.message || 'Unknown error'}</p>
            </div>
          )}
        </div>
      )}

      {/* Statistics */}
      {statusLoading && (
        <div className="text-center py-4">
          <p className="text-gray-500">Loading archive status...</p>
        </div>
      )}

      {statusError && (
        <div className="text-center py-4">
          <p className="text-red-600">Error: {statusError instanceof Error ? statusError.message : 'Failed to load status'}</p>
        </div>
      )}

      {status && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Archived</div>
              <div className="text-2xl font-bold text-gray-900">{status.statistics.totalArchived}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600 mb-1">Last 24 Hours</div>
              <div className="text-2xl font-bold text-blue-900">{status.statistics.recentlyArchived}</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-sm text-yellow-600 mb-1">Pending Archive</div>
              <div className="text-2xl font-bold text-yellow-900">{status.statistics.pendingArchive}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600 mb-1">Active Sales</div>
              <div className="text-2xl font-bold text-green-900">{status.statistics.totalActive}</div>
            </div>
          </div>

          {/* Pending Sales */}
          {status.pendingSales.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Sales Pending Archive ({status.pendingSales.length})
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                <ul className="space-y-2">
                  {status.pendingSales.map((sale) => (
                    <li key={sale.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{sale.title}</span>
                        <span className="text-gray-500 text-xs">
                          {sale.date_end ? `Ends: ${sale.date_end}` : `Started: ${sale.date_start}`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {status.statistics.pendingArchive === 0 && (
            <div className="text-center py-4 text-gray-500 text-sm">
              No sales pending archive. All active sales are current.
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          The archive system automatically runs daily at 02:00 UTC via cron job. 
          Use the "Run Archive Now" button to manually trigger it for testing.
        </p>
      </div>
    </div>
  )
}

