'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useProfile } from '@/lib/hooks/useAuth'
import AccountClient from './AccountClient'

export default function AccountPage() {
  const router = useRouter()
  const { data: user, isLoading: authLoading } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin?redirectTo=/account')
    }
  }, [authLoading, user, router])

  if (authLoading || profileLoading) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
          <div className="text-neutral-600">Checking your account...</div>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="text-center py-16">
          <div className="text-4xl mb-2">🔒</div>
          <div className="text-lg font-medium">Sign in required</div>
          <div className="text-sm mt-2">Redirecting to sign in…</div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Your Account</h1>
      <AccountClient user={user} profile={profile || null} />
    </main>
  )
}

