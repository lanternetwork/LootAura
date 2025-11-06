'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth, useSignIn } from '@/lib/hooks/useAuth'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

export default function SignIn() {
  const router = useRouter()
  const params = useSearchParams()
  const { data: currentUser, isLoading: authLoading } = useAuth()
  const signIn = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && currentUser) {
      // Small delay to ensure auth state is fully propagated
      const timeoutId = setTimeout(() => {
        // Check for redirect query param or sessionStorage
        const redirectParam = params.get('redirectTo')
        const storageRedirect = sessionStorage.getItem('auth:postLoginRedirect')
        const redirectTo = redirectParam || storageRedirect || '/sales'
        console.log('[SIGNIN] Redirecting after login:', { 
          redirectTo, 
          hasParam: !!redirectParam, 
          paramValue: redirectParam,
          hasStorage: !!storageRedirect,
          storageValue: storageRedirect
        })
        // Clear sessionStorage redirect if used
        if (storageRedirect) {
          sessionStorage.removeItem('auth:postLoginRedirect')
        }
        router.replace(redirectTo)
      }, 200) // Increased delay to ensure auth state propagation
      return () => clearTimeout(timeoutId)
    }
  }, [authLoading, currentUser, router, params])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    try {
      await signIn.mutateAsync({ email, password })
      // Redirect will be handled by the useEffect above
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  async function onMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMagicLinkLoading(true)

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send magic link')
      }

      setMagicLinkSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setMagicLinkLoading(false)
    }
  }

  const isLoading = signIn.isPending || authLoading

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <h1 className="text-3xl font-bold text-center">Welcome to Loot Aura</h1>
          <p className="mt-2 text-center text-neutral-600">
            Sign in to save favorites and post your own sales
          </p>
        </div>

        {magicLinkSent ? (
          <div className="text-center space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded text-green-700">
              <p className="font-medium">Magic link sent!</p>
              <p className="text-sm">Check your email and click the link to sign in.</p>
            </div>
            <button
              onClick={() => setMagicLinkSent(false)}
              className="link-accent font-medium"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
                <input 
                  id="email"
                  type="email"
                  className="w-full rounded border px-3 py-2 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
                <input 
                  id="password"
                  type="password" 
                  className="w-full rounded border px-3 py-2 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent" 
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
                  className="w-full rounded px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed btn-accent"
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>

                <button
                  type="button"
                  onClick={onMagicLinkSubmit}
                  disabled={magicLinkLoading || !email}
                  className="w-full rounded border px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[rgba(126,34,206,0.08)]"
                >
                  {magicLinkLoading ? 'Sending...' : 'Send Magic Link'}
                </button>

                <div className="text-center">
                  <Link 
                    href="/auth/forgot-password"
                    className="text-sm link-accent"
                  >
                    Forgot your password?
                  </Link>
                </div>
              </div>
            </form>
          </>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-neutral-50 text-gray-500">Or continue with</span>
          </div>
        </div>

        <GoogleSignInButton />

        <Link 
          href="/auth/signup"
          className="block text-center w-full rounded border px-4 py-2 font-medium border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[rgba(126,34,206,0.08)]"
        >
          Create Account
        </Link>

        <div className="text-center">
          <Link
            href="/"
            className="link-accent font-medium"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
