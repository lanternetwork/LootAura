'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import ProfileClient from './ProfileClient'

export const dynamic = 'force-dynamic'

export default function ProfilePage() {
  const router = useRouter()
  const { data: user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin?redirectTo=/profile')
    }
  }, [authLoading, user, router])

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
          <div className="text-neutral-600">Checking authentication...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center py-16">
          <div className="text-4xl mb-2">🔒</div>
          <div className="text-lg font-medium">Sign in required</div>
          <div className="text-sm mt-2">Redirecting to sign in…</div>
        </div>
      </div>
    )
  }

  return <ProfileClient />
}


