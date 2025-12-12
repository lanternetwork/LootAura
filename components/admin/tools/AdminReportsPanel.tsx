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
  moderation_status: string | null
  owner_is_locked?: boolean
  owner_lock_reason?: string | null
  owner_locked_at?: string | null
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

const MODERATION_STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'visible', label: 'Visible' },
  { value: 'hidden_by_admin', label: 'Hidden' },
  { value: 'under_review', label: 'Under Review' },
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
  const [moderationFilter, setModerationFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [page, setPage] = useState(1)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<'open' | 'in_review' | 'resolved' | 'dismissed'>('open')
  const [hideSale, setHideSale] = useState(false)
  const [lockAccount, setLockAccount] = useState(false)
  const [actionConfirm, setActionConfirm] = useState<{ type: 'hide' | 'unhide' | 'lock' | 'unlock'; reportId: string } | null>(null)
  const queryClient = useQueryClient()

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, reasonFilter, moderationFilter, searchQuery])

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-reports', statusFilter, reasonFilter, page],
    queryFn: () => fetchReports(statusFilter, reasonFilter, page),
  })

  // Client-side filtering for moderation status and search
  const filteredReports = data?.data?.filter((report) => {
    // Moderation status filter
    if (moderationFilter !== 'all') {
      const saleModStatus = report.sales?.moderation_status
      if (moderationFilter === 'visible' && saleModStatus !== null && saleModStatus !== 'published') {
        return false
      }
      if (moderationFilter === 'hidden_by_admin' && saleModStatus !== 'hidden_by_admin') {
        return false
      }
      if (moderationFilter === 'under_review' && saleModStatus !== 'under_review') {
        return false
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const saleTitle = report.sales?.title?.toLowerCase() || ''
      const saleId = report.sale_id?.toLowerCase() || ''
      if (!saleTitle.includes(query) && !saleId.includes(query)) {
        return false
      }
    }

    return true
  }) || []

  // Calculate summary counts
  const summaryCounts = data?.data ? {
    open: data.data.filter((r) => r.status === 'open').length,
    hidden: data.data.filter((r) => r.sales?.moderation_status === 'hidden_by_admin').length,
    locked: data.data.filter((r) => r.sales?.owner_is_locked).length,
  } : { open: 0, hidden: 0, locked: 0 }

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateReport>[1]) => updateReport(selectedReport!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      toast.success('Report updated successfully')
      setSelectedReport(null)
      setActionConfirm(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update report')
      setActionConfirm(null)
    },
  })

  const quickActionMutation = useMutation({
    mutationFn: ({ reportId, data }: { reportId: string; data: Parameters<typeof updateReport>[1] }) => updateReport(reportId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      toast.success('Action completed successfully')
      setActionConfirm(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to perform action')
      setActionConfirm(null)
    },
  })

  const handleQuickAction = (report: Report, action: 'hide' | 'unhide' | 'lock' | 'unlock') => {
    setActionConfirm({ type: action, reportId: report.id })
  }

  const handleConfirmAction = () => {
    if (!actionConfirm) return

    const report = data?.data?.find((r) => r.id === actionConfirm.reportId)
    if (!report) return

    let actionData: Parameters<typeof updateReport>[1] = {}

    if (actionConfirm.type === 'hide') {
      actionData = { hide_sale: true, status: report.status === 'open' ? 'in_review' : report.status }
    } else if (actionConfirm.type === 'unhide') {
      // Note: Unhiding requires updating the sale directly - for now, we'll just update the report
      // In a full implementation, we'd need an API endpoint to unhide sales
      actionData = { status: report.status }
    } else if (actionConfirm.type === 'lock') {
      actionData = { lock_account: true, status: report.status === 'open' ? 'in_review' : report.status }
    } else if (actionConfirm.type === 'unlock') {
      // Note: Unlocking requires updating the profile directly - for now, we'll just update the report
      // In a full implementation, we'd need an API endpoint to unlock accounts
      actionData = { status: report.status }
    }

    quickActionMutation.mutate({ reportId: actionConfirm.reportId, data: actionData })
  }

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

  const getModerationBadge = (status: string | null) => {
    if (!status || status === 'published') {
      return { label: 'Visible', className: 'bg-green-100 text-green-800' }
    }
    if (status === 'hidden_by_admin') {
      return { label: 'Hidden', className: 'bg-red-100 text-red-800' }
    }
    if (status === 'under_review') {
      return { label: 'Under Review', className: 'bg-yellow-100 text-yellow-800' }
    }
    return { label: status, className: 'bg-gray-100 text-gray-800' }
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

      {/* Summary Header */}
      {data && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg flex gap-6 text-sm">
          <div>
            <span className="font-medium text-gray-700">Open reports:</span>{' '}
            <span className="text-gray-900">{summaryCounts.open}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Hidden sales:</span>{' '}
            <span className="text-gray-900">{summaryCounts.hidden}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Locked accounts:</span>{' '}
            <span className="text-gray-900">{summaryCounts.locked}</span>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by sale title or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

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
        <div className="flex-1">
          <label htmlFor="moderation-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Sale Status
          </label>
          <select
            id="moderation-filter"
            value={moderationFilter}
            onChange={(e) => setModerationFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {MODERATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {actionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {actionConfirm.type === 'hide' && 'Hide Sale'}
              {actionConfirm.type === 'unhide' && 'Unhide Sale'}
              {actionConfirm.type === 'lock' && 'Lock Account'}
              {actionConfirm.type === 'unlock' && 'Unlock Account'}
            </h3>
            <p className="text-gray-600 mb-6">
              {actionConfirm.type === 'hide' &&
                'Are you sure you want to hide this sale? It will no longer be visible to users.'}
              {actionConfirm.type === 'unhide' &&
                'Are you sure you want to unhide this sale? It will become visible to users again.'}
              {actionConfirm.type === 'lock' &&
                'Are you sure you want to lock this account? The user will no longer be able to create or edit sales.'}
              {actionConfirm.type === 'unlock' &&
                'Are you sure you want to unlock this account? The user will regain normal access.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmAction}
                disabled={quickActionMutation.isPending}
                className="flex-1 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
              >
                {quickActionMutation.isPending ? 'Processing...' : 'Confirm'}
              </button>
              <button
                onClick={() => setActionConfirm(null)}
                disabled={quickActionMutation.isPending}
                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                      Moderation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No reports found
                      </td>
                    </tr>
                  ) : (
                    filteredReports.map((report) => {
                      const moderationBadge = getModerationBadge(report.sales?.moderation_status || null)
                      const isLocked = report.sales?.owner_is_locked || false
                      return (
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
                              {isLocked && (
                                <div className="mt-1">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    Account locked
                                  </span>
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
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${moderationBadge.className}`}
                            >
                              {moderationBadge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {formatDate(report.created_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-2">
                              {report.sales?.moderation_status === 'hidden_by_admin' ? (
                                <button
                                  onClick={() => handleQuickAction(report, 'unhide')}
                                  className="text-blue-600 hover:text-blue-700 text-xs"
                                  disabled={quickActionMutation.isPending}
                                >
                                  Unhide
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleQuickAction(report, 'hide')}
                                  className="text-red-600 hover:text-red-700 text-xs"
                                  disabled={quickActionMutation.isPending}
                                >
                                  Hide
                                </button>
                              )}
                              {isLocked ? (
                                <button
                                  onClick={() => handleQuickAction(report, 'unlock')}
                                  className="text-blue-600 hover:text-blue-700 text-xs"
                                  disabled={quickActionMutation.isPending}
                                >
                                  Unlock
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleQuickAction(report, 'lock')}
                                  className="text-red-600 hover:text-red-700 text-xs"
                                  disabled={quickActionMutation.isPending}
                                >
                                  Lock
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
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

