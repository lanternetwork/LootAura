'use client'
import Link from 'next/link'
import Image from 'next/image'
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
        // Check for redirect query param (accept both 'redirect' and 'redirectTo' for consistency)
        let redirectParam = params.get('redirectTo') || params.get('redirect')
        
        // Decode the redirectTo if it was encoded
        if (redirectParam) {
          try {
            redirectParam = decodeURIComponent(redirectParam)
          } catch (e) {
            // If decoding fails, use as-is
          }
        }
        
        const storageRedirect = sessionStorage.getItem('auth:postLoginRedirect')
        let redirectTo = redirectParam || storageRedirect || '/sales'
        
        // Prevent redirect loops: never redirect to auth pages
        if (redirectTo.startsWith('/auth/') || redirectTo.startsWith('/login') || redirectTo.startsWith('/signin')) {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.warn('[SIGNIN] Preventing redirect loop - redirectTo is an auth page, using default:', redirectTo)
          }
          redirectTo = '/sales'
        }
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SIGNIN] Redirecting after login:', { 
            redirectTo, 
            hasParam: !!redirectParam,
            paramValue: redirectParam,
            hasStorage: !!storageRedirect,
            storageValue: storageRedirect
          })
        }
        // Clear sessionStorage redirect if used
        if (storageRedirect) {
          sessionStorage.removeItem('auth:postLoginRedirect')
          sessionStorage.removeItem('draft:returnStep')
        }
        router.replace(redirectTo)
      }, 500) // Increased delay to ensure auth state and cookies are fully propagated
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
    <div className="min-h-screen md:h-[calc(100vh-4rem)] bg-neutral-50">
      {/* Mobile: Centered card layout (preserved) */}
      <div className="md:hidden min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8">
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

      {/* Desktop: 2-column layout (left: form panel, right: hero image) */}
      <div className="hidden md:grid md:grid-cols-[minmax(400px,480px)_1fr] h-full">
        {/* Left Column: Form Panel */}
        <div className="flex flex-col justify-between bg-white px-8 lg:px-12 py-12">
          <div className="max-w-[420px] w-full mx-auto space-y-8">
            {/* Top Section: Logo and Welcome */}
            <div className="space-y-2">
              <Link href="/" className="inline-block">
                <h2 className="text-2xl font-bold text-[#3A2268]">Loot Aura</h2>
              </Link>
              <p className="text-sm text-neutral-600">Welcome back</p>
            </div>

            {/* Main Form Block */}
            <div className="space-y-6">
              {magicLinkSent ? (
                <div className="space-y-4">
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
                      <label htmlFor="email-desktop" className="block text-sm font-medium mb-1">Email</label>
                      <input 
                        id="email-desktop"
                        type="email"
                        className="w-full rounded border px-3 py-2 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        placeholder="your@email.com"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="password-desktop" className="block text-sm font-medium mb-1">Password</label>
                      <input 
                        id="password-desktop"
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

                      <div className="text-left">
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
                  <span className="px-2 bg-white text-gray-500">Or continue with</span>
                </div>
              </div>

              <GoogleSignInButton />

              <Link 
                href="/auth/signup"
                className="block text-center w-full rounded border px-4 py-2 font-medium border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[rgba(126,34,206,0.08)]"
              >
                Create Account
              </Link>
            </div>
          </div>

          {/* Footer: Legal Text */}
          <div className="max-w-[420px] w-full mx-auto pt-8">
            <p className="text-xs text-neutral-500">
              By signing in, you agree to Loot Aura's{' '}
              <Link href="/terms" className="text-neutral-600 hover:text-neutral-900 hover:underline">
                Terms
              </Link>
              {' '}and{' '}
              <Link href="/privacy" className="text-neutral-600 hover:text-neutral-900 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Right Column: Hero Image */}
        <div className="relative hidden md:block">
          <Image
            src="/brand/SignInHero.png"
            alt="Yard sale scene"
            fill
            className="object-cover"
            priority
            sizes="50vw"
          />
          {/* Optional gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/30"></div>
          {/* Optional text overlay */}
          <div className="absolute bottom-12 left-12 max-w-md">
            <h3 className="text-3xl font-semibold text-white mb-2">Discover local yard sales.</h3>
            <p className="text-lg text-white/90">Browse and host sales in your neighborhood.</p>
          </div>
          {/* Attribution */}
          <div className="absolute bottom-4 right-4">
            <a
              href="https://www.freepik.com/free-photo/full-shot-people-garage-sale_58396958.htm#fromView=keyword&page=1&position=22&uuid=a1bd528a-10ef-4a36-8e16-80febdf443bd&query=Online+yard+sale"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/80 hover:text-white underline transition-colors"
            >
              Image by freepik
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
