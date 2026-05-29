'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  parseAuthTokensFromHash,
  parseAuthTokensFromSearch,
} from '@/lib/auth/parseAuthFragment'

type CompleteAuthFromFragmentProps = {
  /** Default redirect after success */
  defaultRedirect?: string
  /** Recovery path when tokens missing (e.g. link to sign-in) */
  missingTokensHref?: string
  /** For password recovery: stay on page and expose tokens via callback instead of redirect */
  onTokensReady?: (tokens: { access_token: string; refresh_token: string }) => void
  /** Skip auto-redirect after session (recovery form handles password update) */
  skipRedirect?: boolean
}

/**
 * Completes Supabase auth when tokens arrive in the URL hash (implicit / email confirmation).
 * Server Route Handlers cannot read hash fragments; this runs client-side then POSTs to establish SSR cookies.
 */
export function CompleteAuthFromFragment({
  defaultRedirect = '/sales',
  missingTokensHref = '/auth/signin',
  onTokensReady,
  skipRedirect = false,
}: CompleteAuthFromFragmentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error' | 'done'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const run = async () => {
      const hashTokens =
        typeof window !== 'undefined'
          ? parseAuthTokensFromHash(window.location.hash)
          : null
      const queryTokens = parseAuthTokensFromSearch(
        typeof window !== 'undefined' ? window.location.search : ''
      )
      const tokens = hashTokens ?? queryTokens

      if (!tokens) {
        setStatus('error')
        setErrorMessage('Sign-in link is incomplete or has expired. Please try again.')
        return
      }

      if (onTokensReady) {
        onTokensReady({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        })
      }

      const redirectTo =
        searchParams.get('redirectTo') ||
        searchParams.get('next') ||
        defaultRedirect

      try {
        const response = await fetch('/api/auth/establish-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            redirectTo,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to complete sign-in')
        }

        if (typeof window !== 'undefined' && window.location.hash) {
          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search
          )
        }

        setStatus('done')

        if (!skipRedirect) {
          const target =
            typeof data.redirectTo === 'string' ? data.redirectTo : defaultRedirect
          router.replace(target)
        }
      } catch (err) {
        setStatus('error')
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to complete sign-in'
        )
      }
    }

    void run()
  }, [
    router,
    searchParams,
    defaultRedirect,
    onTokensReady,
    skipRedirect,
  ])

  if (status === 'loading' || (status === 'done' && !skipRedirect)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-gray-600">Completing sign-in…</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-red-700 mb-4">{errorMessage}</p>
          <a
            href={missingTokensHref}
            className="text-blue-600 hover:underline"
          >
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return null
}
