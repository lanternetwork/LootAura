'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import AccountClient from './AccountClient'

export default function AccountPage() {
  const router = useRouter()
  const { data: user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin?redirectTo=/account')
    }
  }, [authLoading, user, router])

  if (authLoading) {
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
      <AccountClient />
    </main>
  )
}

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import AccountClient from './AccountClient'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { T } from '@/lib/supabase/tables'

export default async function AccountPage() {
  const supabase = createSupabaseServerClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    notFound()
  }

  // Get user's profile
  const { data: profile } = await supabase
    .from(T.profiles)
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<AccountSkeleton />}>
        <AccountClient 
          user={user}
          profile={profile}
        />
      </Suspense>
    </div>
  )
}

function AccountSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        {/* Header skeleton */}
        <div className="h-8 bg-gray-200 rounded-lg animate-pulse w-1/3"></div>
        
        {/* Profile form skeleton */}
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/4"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
