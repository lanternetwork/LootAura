'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCsrfHeaders } from '@/lib/csrf-client'
import { toast } from 'react-toastify'
import Link from 'next/link'

interface Sale {
  id: string
  title: string
  address: string | null
  city: string | null
  state: string | null
  owner_id: string
}

interface Report {
  id: string
  sale_id: string
  reporter_profile_id: string | null
  reason: string
  details: string | null
  status: 'open' | 'in_review' | 'resolved' | 'dismissed'
  action_taken: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
  sales: Sale | null
}

interface ReportsResponse {
  ok: boolean
  data: Report[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const REPORT_REASONS = [
  { value: 'fraud', label: 'Fraud / scam' },
  { value: 'prohibited_items', label: 'Prohibited items' },
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
] as const

const REPORT_STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
] as const

async function fetchReports(status: string, reason: string, page: number): Promise<ReportsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: '50',
  })
  if (status && status !== 'all') {
    params.set('status', status)
  }
  if (reason) {
    params.set('reason', reason)
  }

  const response = await fetch(`/api/admin/reports?${params.toString()}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch reports' }))
    throw new Error(errorData.error || 'Failed to fetch reports')
  }

  return response.json()
}

async function updateReport(
  reportId: string,
  data: {
    status?: 'open' | 'in_review' | 'resolved' | 'dismissed'
    action_taken?: string | null
    admin_notes?: string | null
    hide_sale?: boolean
    lock_account?: boolean
  }
): Promise<void> {
  const response = await fetch(`/api/admin/reports/${reportId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getCsrfHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to update report' }))
    throw new Error(errorData.error || 'Failed to update report')
  }
}

export default function AdminReportsPanel() {
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [reasonFilter, setReasonFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<'open' | 'in_review' | 'resolved' | 'dismissed'>('open')
  const [hideSale, setHideSale] = useState(false)
  const [lockAccount, setLockAccount] = useState(false)
  const queryClient = useQueryClient()

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, reasonFilter])

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-reports', statusFilter, reasonFilter, page],
    queryFn: () => fetchReports(statusFilter, reasonFilter, page),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateReport>[1]) => updateReport(selectedReport!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      toast.success('Report updated successfully')
      setSelectedReport(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update report')
    },
  })

  const handleReportClick = (report: Report) => {
    setSelectedReport(report)
    setAdminNotes(report.admin_notes || '')
    setSelectedStatus(report.status)
    setHideSale(false)
    setLockAccount(false)
  }

  const handleSave = () => {
    if (!selectedReport) return

    updateMutation.mutate({
      status: selectedStatus,
      admin_notes: adminNotes.trim() || null,
      hide_sale: hideSale,
      lock_account: lockAccount,
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getReasonLabel = (reason: string) => {
    return REPORT_REASONS.find((r) => r.value === reason)?.label || reason
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      open: 'bg-red-100 text-red-800',
      in_review: 'bg-yellow-100 text-yellow-800',
      resolved: 'bg-green-100 text-green-800',
      dismissed: 'bg-gray-100 text-gray-800',
    }
    return colors[status as keyof typeof colors] || colors.dismissed
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Sale Reports</h2>
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium">Error loading reports</p>
          <p className="text-xs text-red-600 mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-4">
        <div className="flex-1">
          <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="reason-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Reason
          </label>
          <select
            id="reason-filter"
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All reasons</option>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reports Table */}
      {isLoading && (
        <div className="text-center py-8">
          <p className="text-gray-500">Loading reports...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-red-600">Error: {error instanceof Error ? error.message : 'Failed to load reports'}</p>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Table */}
          <div className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sale
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.data.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No reports found
                      </td>
                    </tr>
                  ) : (
                    data.data.map((report) => (
                      <tr
                        key={report.id}
                        onClick={() => handleReportClick(report)}
                        className={`hover:bg-gray-50 cursor-pointer ${
                          selectedReport?.id === report.id ? 'bg-purple-50' : ''
                        } ${report.status === 'open' ? 'font-medium' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            {report.sales ? (
                              <Link
                                href={`/sales/${report.sale_id}`}
                                target="_blank"
                                onClick={(e) => e.stopPropagation()}
                                className="text-purple-600 hover:text-purple-700 font-medium"
                              >
                                {report.sales.title}
                              </Link>
                            ) : (
                              <span className="text-gray-500">Sale not found</span>
                            )}
                            {report.sales && (
                              <div className="text-xs text-gray-500 mt-1">
                                {report.sales.city}, {report.sales.state}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {getReasonLabel(report.reason)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(
                              report.status
                            )}`}
                          >
                            {report.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {formatDate(report.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {((page - 1) * data.pagination.limit) + 1} to{' '}
                  {Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total} reports
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page >= data.pagination.totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-1">
            {selectedReport ? (
              <div className="bg-gray-50 rounded-lg p-4 space-y-4 sticky top-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Report Details</h3>
                  {selectedReport.sales && (
                    <div className="mb-3">
                      <Link
                        href={`/sales/${selectedReport.sale_id}`}
                        target="_blank"
                        className="text-purple-600 hover:text-purple-700 font-medium text-sm"
                      >
                        {selectedReport.sales.title}
                      </Link>
                      <div className="text-xs text-gray-500 mt-1">
                        {selectedReport.sales.address && `${selectedReport.sales.address}, `}
                        {selectedReport.sales.city}, {selectedReport.sales.state}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as typeof selectedStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="open">Open</option>
                    <option value="in_review">In Review</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                  <div className="text-sm text-gray-600">{getReasonLabel(selectedReport.reason)}</div>
                </div>

                {selectedReport.details && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Details</label>
                    <div className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200 max-h-32 overflow-y-auto">
                      {selectedReport.details}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Admin Notes</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Add internal notes..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                  <div className="mt-1 text-xs text-gray-500 text-right">
                    {adminNotes.length}/2000
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={hideSale}
                      onChange={(e) => setHideSale(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Hide sale</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={lockAccount}
                      onChange={(e) => setLockAccount(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Lock account</span>
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setSelectedReport(null)}
                    disabled={updateMutation.isPending}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
                <p>Select a report to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

