'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send password reset email')
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
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Password Reset Email Sent
            </h1>
            <p className="text-gray-600 mb-6">
              Check your email for instructions on how to reset your password.
            </p>
            <Link
              href="/auth/signin"
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors inline-block"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div>
          <h1 className="text-3xl font-bold text-center">Reset Password</h1>
          <p className="mt-2 text-center text-neutral-600">
            Enter your email address and we'll send you a link to reset your password
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 mt-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input 
              type="email"
              className="w-full rounded border px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="your@email.com"
              required
            />
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 text-white px-4 py-2 rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending...' : 'Send Reset Email'}
            </button>
            
            <Link
              href="/auth/signin"
              className="w-full bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors inline-block text-center"
            >
              Back to Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
