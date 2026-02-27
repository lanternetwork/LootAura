'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import AccountRemovalClient from './AccountRemovalClient'

export default function AccountRemovalPage() {
  const router = useRouter()
  const { data: user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin?redirectTo=/accountremoval')
    }
  }, [authLoading, user, router])

  if (authLoading) {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
          <div className="text-neutral-600">Loading...</div>
        </div>
      </main>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  return (
    <main className="max-w-4xl mx-auto p-4">
      <AccountRemovalClient user={user} />
    </main>
  )
}
