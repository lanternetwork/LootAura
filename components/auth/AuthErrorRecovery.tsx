'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { parseAuthTokensFromHash } from '@/lib/auth/parseAuthFragment'

/**
 * Recovers sessions when Supabase tokens are in the URL hash but the user was sent to /auth/error
 * (e.g. legacy missing_code redirect before hash handling). Hash is preserved on the error page URL.
 */
export function AuthErrorRecovery() {
  const router = useRouter()
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (attemptedRef.current) return
    const tokens = parseAuthTokensFromHash(window.location.hash)
    if (!tokens) return
    attemptedRef.current = true
    router.replace(`/auth/callback/finish${window.location.search}${window.location.hash}`)
  }, [router])

  return null
}
