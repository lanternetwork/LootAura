'use client'
import { useState } from 'react'
import { useSignIn, useSignUp } from '@/lib/hooks/useAuth'
import Link from 'next/link'

export default function SignIn() {
  const signIn = useSignIn()
  const signUp = useSignUp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    try {
      await signIn.mutateAsync({ email, password })
      window.location.href = '/explore'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  async function handleSignUp() {
    setError(null)

    try {
      await signUp.mutateAsync({ email, password })
      alert('Check your email for a confirmation link!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  const isLoading = signIn.isPending || signUp.isPending

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <h1 className="text-3xl font-bold text-center">Welcome to Loot Aura</h1>
          <p className="mt-2 text-center text-neutral-600">
            Sign in to save favorites and post your own sales
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input 
              type="password" 
              className="w-full rounded border px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="••••••••"
              required
            />
          </div>

          <div className="space-y-3">
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full rounded bg-amber-500 px-4 py-2 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>

            <button 
              type="button"
              onClick={handleSignUp}
              disabled={isLoading}
              className="w-full rounded border border-amber-500 px-4 py-2 text-amber-600 font-medium hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        </form>

        <div className="text-center">
          <Link 
            href="/" 
            className="text-amber-600 hover:text-amber-700 font-medium"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
