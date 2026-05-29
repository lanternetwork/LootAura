'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/useAuth'
import { parseAuthTokensFromHash } from '@/lib/auth/parseAuthFragment'
import {
  buildAuthCallbackDelegationUrl,
  buildAuthCallbackFinishDelegationUrl,
  parseRecoveryAuthError,
  shouldDelegateToAuthCallback,
} from '@/lib/auth/authRecovery'

type ResetPhase = 'pending' | 'delegating' | 'error' | 'ready'

function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setError(
        'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      )
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
        throw new Error(data.message || data.error || 'Failed to update password')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Password Updated Successfully
            </h1>
            <Link href="/auth/signin" className="text-blue-600 hover:underline">
              Sign In Now
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold text-center">Reset Password</h1>
        <p className="mt-2 text-center text-neutral-600 mb-6">
          Enter your new password below
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium mb-1">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded border px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded border px-3 py-2"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 text-white px-4 py-2 rounded-md disabled:opacity-50"
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>
          <Link href="/auth/signin" className="block text-center text-gray-600 hover:underline">
            Back to Sign In
          </Link>
        </form>
      </div>
    </div>
  )
}

function ResetPasswordInner() {
  const params = useSearchParams()
  const { data: user, isLoading: authLoading } = useAuth()
  const [phase, setPhase] = useState<ResetPhase>('pending')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const recoveryError = parseRecoveryAuthError(params)
    if (recoveryError) {
      setErrorMessage(recoveryError)
      setPhase('error')
      return
    }

    if (shouldDelegateToAuthCallback(params)) {
      setPhase('delegating')
      const target = buildAuthCallbackDelegationUrl(window.location.origin, params)
      window.location.replace(target)
      return
    }

    const hashTokens = parseAuthTokensFromHash(window.location.hash)
    if (hashTokens) {
      setPhase('delegating')
      const finishPath = buildAuthCallbackFinishDelegationUrl(window.location.origin)
      window.location.replace(finishPath + window.location.hash)
      return
    }

    setPhase('pending')
  }, [params])

  useEffect(() => {
    if (phase === 'error' || phase === 'delegating') return
    if (authLoading) return
    if (user) {
      setPhase('ready')
      return
    }
    if (phase === 'pending') {
      setErrorMessage(
        'Your reset link is invalid or has expired. Please request a new one.'
      )
      setPhase('error')
    }
  }, [phase, authLoading, user])

  if (phase === 'pending' || phase === 'delegating' || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-gray-600">
            {phase === 'delegating' ? 'Verifying your reset link…' : 'Loading…'}
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'error' || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-red-700 mb-4">
            {errorMessage ||
              'Your reset link is invalid or has expired. Please request a new one.'}
          </p>
          <Link href="/auth/forgot-password" className="text-blue-600 hover:underline">
            Request reset email
          </Link>
        </div>
      </div>
    )
  }

  return <ResetPasswordForm />
}

export default function ResetPassword() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  )
}
