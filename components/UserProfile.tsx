'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useProfile, useSignOut } from '@/lib/hooks/useAuth'

export default function UserProfile() {
  const router = useRouter()
  const { data: user, isLoading: authLoading, isError: authError } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const signOut = useSignOut()
  const [open, setOpen] = useState(false)
  const [showLoading, setShowLoading] = useState(true)

  // Timeout fallback: if loading takes more than 3 seconds, show sign in button
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authLoading || profileLoading) {
        setShowLoading(false)
      }
    }, 3000)

    // Clear loading state once auth/profile loads
    if (!authLoading && !profileLoading) {
      setShowLoading(false)
      clearTimeout(timer)
    }

    return () => clearTimeout(timer)
  }, [authLoading, profileLoading])

  const toggle = () => setOpen(v => !v)

  const handleSignOut = () => {
    setOpen(false)
    signOut.mutate(undefined, {
      onSuccess: () => {
        // Redirect to home page after successful sign out
        router.push('/')
      },
    })
  }

  // Show loading only if actively loading AND not timed out AND no error
  if ((authLoading || profileLoading) && showLoading && !authError) {
    return (
      <div className="flex items-center gap-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-500"></div>
        <span className="text-sm text-neutral-600">Loading...</span>
      </div>
    )
  }

  if (!user) {
    return (
      <a 
        href="/auth/signin" 
        className="btn-accent-secondary text-sm whitespace-nowrap"
      >
        Sign In
      </a>
    )
  }

  return (
    <div className="relative flex items-center gap-3">
      <button onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-medium text-sm">
        {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
      </button>
      <span className="text-sm font-medium text-neutral-700 max-w-[140px] truncate hidden lg:inline">
        {profile?.display_name || user.email}
      </span>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
          <div className="p-2 flex flex-col">
            <a href="/dashboard" className="px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded" onClick={()=>setOpen(false)}>Dashboard</a>
            <button onClick={handleSignOut} disabled={signOut.isPending} className="mt-1 px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded">{signOut.isPending ? 'Signing out…' : 'Sign Out'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
