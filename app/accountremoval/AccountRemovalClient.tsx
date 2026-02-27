'use client'

import { useState, useEffect, useTransition } from 'react'
import { User } from '@supabase/supabase-js'

interface AccountRemovalClientProps {
  user: User
}

interface DeletionRequest {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
  created_at: string
  processed_at?: string | null
}

export default function AccountRemovalClient({ user: _user }: AccountRemovalClientProps) {
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [existingRequest, setExistingRequest] = useState<DeletionRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch existing request on mount
  useEffect(() => {
    const fetchRequest = async () => {
      try {
        const response = await fetch('/api/account/deletion-requests')
        if (response.ok) {
          const data = await response.json()
          if (data.ok && data.request) {
            setExistingRequest(data.request)
            if (data.request.status === 'pending') {
              setMessage({
                type: 'error',
                text: 'You already have a pending deletion request. It will be reviewed by our team.'
              })
            }
          }
        }
      } catch (error) {
        // Silently fail - user can still submit if fetch fails
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('Failed to fetch existing request:', error)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchRequest()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!confirmed) {
      setMessage({ type: 'error', text: 'You must confirm that you understand this action cannot be undone.' })
      return
    }

    startTransition(async () => {
      try {
        // Get CSRF token from cookie
        const csrfToken = document.cookie
          .split('; ')
          .find(row => row.startsWith('csrf-token='))
          ?.split('=')[1]

        const response = await fetch('/api/account/deletion-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken && { 'x-csrf-token': csrfToken })
          },
          body: JSON.stringify({
            reason: reason.trim() || undefined,
            confirmed: true
          })
        })

        const data = await response.json()

        if (response.ok && data.ok) {
          setMessage({
            type: 'success',
            text: 'Your account deletion request has been submitted. Our team will review it and process it within 7 business days.'
          })
          setExistingRequest(data.request)
          setReason('')
          setConfirmed(false)
        } else {
          if (data.code === 'ALREADY_PENDING') {
            setMessage({
              type: 'error',
              text: 'You already have a pending deletion request. It will be reviewed by our team.'
            })
            if (data.details?.request) {
              setExistingRequest(data.details.request)
            }
          } else {
            setMessage({
              type: 'error',
              text: data.error || 'Failed to submit deletion request. Please try again.'
            })
          }
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'An error occurred. Please try again.' })
      }
    })
  }

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
        <div className="text-neutral-600">Loading...</div>
      </div>
    )
  }

  const hasPendingRequest = existingRequest?.status === 'pending'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Request Account Deletion</h1>
        <p className="text-gray-600">
          Submit a request to have your account permanently deleted
        </p>
      </div>

      {/* Warning Section */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
        <div className="flex items-start">
          <svg className="w-6 h-6 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h2 className="text-lg font-semibold text-red-900 mb-2">Permanent Account Deletion</h2>
            <p className="text-red-800 mb-3">
              This action cannot be undone. Once your account is deleted, all of the following will be permanently removed:
            </p>
            <ul className="list-disc list-inside text-red-800 space-y-1">
              <li>Your profile and account information</li>
              <li>All sales listings you've created</li>
              <li>Your favorites and saved items</li>
              <li>All associated data and history</li>
            </ul>
            <p className="text-red-800 mt-3">
              <strong>Processing time:</strong> Your request will be reviewed and processed within 7 business days.
            </p>
          </div>
        </div>
      </div>

      {/* Existing Request Status */}
      {existingRequest && (
        <div className={`border rounded-lg p-6 mb-8 ${
          existingRequest.status === 'pending' 
            ? 'bg-yellow-50 border-yellow-200' 
            : existingRequest.status === 'processing'
            ? 'bg-blue-50 border-blue-200'
            : existingRequest.status === 'completed'
            ? 'bg-gray-50 border-gray-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h3 className="font-semibold text-gray-900 mb-2">Current Request Status</h3>
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-medium">Status:</span>{' '}
              <span className="capitalize">{existingRequest.status}</span>
            </div>
            <div>
              <span className="font-medium">Requested:</span>{' '}
              {new Date(existingRequest.created_at).toLocaleString()}
            </div>
            {existingRequest.processed_at && (
              <div>
                <span className="font-medium">Processed:</span>{' '}
                {new Date(existingRequest.processed_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form */}
      {!hasPendingRequest && (
        <div className="bg-white rounded-lg shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Reason Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (Optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please let us know why you're deleting your account (optional)"
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                {reason.length}/500 characters
              </p>
            </div>

            {/* Confirmation Checkbox */}
            <div className="flex items-start">
              <input
                type="checkbox"
                id="confirmed"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                required
              />
              <label htmlFor="confirmed" className="ml-3 text-sm text-gray-700">
                I understand that this action cannot be undone and all my data will be permanently deleted.
              </label>
            </div>

            {/* Message */}
            {message && (
              <div className={`p-4 rounded-lg ${
                message.type === 'success' 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {message.text}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending || !confirmed}
                className="inline-flex items-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  'Submit Deletion Request'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
