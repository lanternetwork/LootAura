'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  canChangePasswordInApp,
  getOAuthPasswordManagedMessage,
} from '@/lib/auth/authProviders'

const PASSWORD_COMPLEXITY =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/

function validatePassword(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) {
    return 'Passwords do not match'
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters'
  }
  if (!PASSWORD_COMPLEXITY.test(password)) {
    return 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
  }
  return null
}

interface AccountSecuritySectionProps {
  user: User
}

export default function AccountSecuritySection({ user }: AccountSecuritySectionProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const canChangePassword = canChangePasswordInApp(user)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const validationError = validatePassword(password, confirmPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || data.message || 'Failed to update password. Please try again.'
        )
      }

      setSuccess(true)
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-labelledby="account-security-heading">
      <h2 id="account-security-heading" className="text-xl font-semibold text-gray-900 mb-2">
        Security
      </h2>
      <p className="text-sm text-gray-600 mb-6">
        Manage how you sign in to LootAura
      </p>

      {canChangePassword ? (
        <form onSubmit={onSubmit} className="space-y-4 max-w-md">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Password updated successfully.
            </div>
          )}
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {loading ? 'Updating…' : 'Change password'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-4">
          {getOAuthPasswordManagedMessage(user)}
        </p>
      )}
    </section>
  )
}
