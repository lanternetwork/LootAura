'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCsrfHeaders } from '@/lib/csrf-client'
import { toast } from 'react-toastify'
import Link from 'next/link'
import { useDebounce } from '@/lib/hooks/useDebounce'

interface User {
  id: string
  username: string | null
  full_name: string | null
  created_at: string
  is_locked: boolean
  locked_at: string | null
  locked_by: string | null
  lock_reason: string | null
}

interface UsersResponse {
  ok: boolean
  data: User[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

async function fetchUsers(q: string, locked: string, page: number): Promise<UsersResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: '50',
  })
  if (q) {
    params.set('q', q)
  }
  if (locked && locked !== 'all') {
    params.set('locked', locked)
  }

  const response = await fetch(`/api/admin/users?${params.toString()}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch users' }))
    throw new Error(errorData.error || 'Failed to fetch users')
  }

  return response.json()
}

async function lockUser(userId: string, locked: boolean, reason?: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}/lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getCsrfHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify({
      locked,
      reason: reason || null,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to update user' }))
    throw new Error(errorData.error || 'Failed to update user')
  }
}

export default function AdminUsersPanel() {
  const [searchQuery, setSearchQuery] = useState('')
  const [lockFilter, setLockFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [lockConfirm, setLockConfirm] = useState<{ userId: string; locked: boolean; reason?: string } | null>(null)
  const [lockReason, setLockReason] = useState('')
  const queryClient = useQueryClient()

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, lockFilter])

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', debouncedSearch, lockFilter, page],
    queryFn: () => fetchUsers(debouncedSearch, lockFilter, page),
  })

  const lockMutation = useMutation({
    mutationFn: ({ userId, locked, reason }: { userId: string; locked: boolean; reason?: string }) =>
      lockUser(userId, locked, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User lock status updated')
      setLockConfirm(null)
      setLockReason('')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update user lock status')
    },
  })

  const handleLockClick = (userId: string, currentlyLocked: boolean) => {
    setLockReason('')
    setLockConfirm({ userId, locked: !currentlyLocked })
  }

  const handleConfirmLock = () => {
    if (!lockConfirm) return
    lockMutation.mutate({
      userId: lockConfirm.userId,
      locked: lockConfirm.locked,
      reason: lockConfirm.locked && lockReason.trim() ? lockReason.trim() : undefined,
    })
  }

  const formatRelativeTime = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return `${Math.floor(diffDays / 30)} months ago`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">User Management</h2>
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium">Error loading users</p>
          <p className="text-xs text-red-600 mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      )}

      {/* Search and Filters */}
      <div className="mb-4 flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by username or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="w-48">
          <label htmlFor="lock-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Lock Status
          </label>
          <select
            id="lock-filter"
            value={lockFilter}
            onChange={(e) => setLockFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All</option>
            <option value="true">Locked</option>
            <option value="false">Unlocked</option>
          </select>
        </div>
      </div>

      {/* Confirmation Modal */}
      {lockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {lockConfirm.locked ? 'Lock Account' : 'Unlock Account'}
            </h3>
            <p className="text-gray-600 mb-4">
              {lockConfirm.locked
                ? 'Lock this account? They will no longer be able to create or edit sales, leave reviews, or change their profile.'
                : 'Unlock this account and restore normal access?'}
            </p>
            {lockConfirm.locked && (
              <div className="mb-4">
                <label htmlFor="lock-reason" className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (optional)
                </label>
                <textarea
                  id="lock-reason"
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Enter reason for locking this account..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <div className="mt-1 text-xs text-gray-500 text-right">
                  {lockReason.length}/500
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleConfirmLock}
                disabled={lockMutation.isPending}
                className="flex-1 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
              >
                {lockMutation.isPending ? 'Updating...' : 'Confirm'}
              </button>
              <button
                onClick={() => {
                  setLockConfirm(null)
                  setLockReason('')
                }}
                disabled={lockMutation.isPending}
                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      {isLoading && (
        <div className="text-center py-8">
          <p className="text-gray-500">Loading users...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-red-600">Error: {error instanceof Error ? error.message : 'Failed to load users'}</p>
        </div>
      )}

      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  data.data.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <Link
                            href={`/u/${user.username || user.id}`}
                            target="_blank"
                            className="text-sm font-medium text-purple-600 hover:text-purple-700"
                          >
                            {user.username || user.full_name || user.id.substring(0, 8) || 'Unknown'}
                          </Link>
                          {user.full_name && user.username && (
                            <span className="text-xs text-gray-500">{user.full_name}</span>
                          )}
                          {!user.username && (
                            <span className="text-xs text-gray-400">ID: {user.id.substring(0, 8)}...</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {user.is_locked ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Locked
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          )}
                          {user.is_locked && user.lock_reason && (
                            <div className="text-xs text-gray-500 max-w-xs truncate" title={user.lock_reason}>
                              {user.lock_reason}
                            </div>
                          )}
                          {user.is_locked && user.locked_at && (
                            <div className="text-xs text-gray-400">
                              {formatRelativeTime(user.locked_at)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <Link
                            href={`/u/${user.username || user.id}`}
                            target="_blank"
                            className="text-purple-600 hover:text-purple-700"
                          >
                            View Profile
                          </Link>
                          <button
                            onClick={() => handleLockClick(user.id, user.is_locked)}
                            className="text-red-600 hover:text-red-700"
                          >
                            {user.is_locked ? 'Unlock' : 'Lock'}
                          </button>
                        </div>
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
                {Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total} users
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
        </>
      )}
    </div>
  )
}

