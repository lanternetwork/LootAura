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

async function fetchUsers(q: string, page: number): Promise<UsersResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: '50',
  })
  if (q) {
    params.set('q', q)
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
  const [page, setPage] = useState(1)
  const [lockConfirm, setLockConfirm] = useState<{ userId: string; locked: boolean } | null>(null)
  const queryClient = useQueryClient()

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', debouncedSearch, page],
    queryFn: () => fetchUsers(debouncedSearch, page),
  })

  const lockMutation = useMutation({
    mutationFn: ({ userId, locked, reason }: { userId: string; locked: boolean; reason?: string }) =>
      lockUser(userId, locked, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User lock status updated')
      setLockConfirm(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update user lock status')
    },
  })

  const handleLockClick = (userId: string, currentlyLocked: boolean) => {
    setLockConfirm({ userId, locked: !currentlyLocked })
  }

  const handleConfirmLock = () => {
    if (!lockConfirm) return
    lockMutation.mutate({
      userId: lockConfirm.userId,
      locked: lockConfirm.locked,
    })
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

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by username or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Confirmation Modal */}
      {lockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {lockConfirm.locked ? 'Lock Account' : 'Unlock Account'}
            </h3>
            <p className="text-gray-600 mb-6">
              {lockConfirm.locked
                ? 'Lock this account? They will no longer be able to create or edit sales, leave reviews, or change their profile.'
                : 'Unlock this account and restore normal access?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmLock}
                disabled={lockMutation.isPending}
                className="flex-1 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
              >
                {lockMutation.isPending ? 'Updating...' : 'Confirm'}
              </button>
              <button
                onClick={() => setLockConfirm(null)}
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
                            href={`/profile/${user.username || user.id}`}
                            target="_blank"
                            className="text-sm font-medium text-purple-600 hover:text-purple-700"
                          >
                            {user.username || user.full_name || 'Unknown'}
                          </Link>
                          {user.full_name && user.username && (
                            <span className="text-xs text-gray-500">{user.full_name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.is_locked ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <Link
                            href={`/profile/${user.username || user.id}`}
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

