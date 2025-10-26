'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

/**
 * EmailVerificationReturn - Handles seamless return after email verification
 * 
 * This component:
 * 1. Checks localStorage for stored auth context
 * 2. Restores the user's original tab state
 * 3. Redirects to the intended destination
 * 4. Cleans up stored context
 */
export default function EmailVerificationReturn() {
  const router = useRouter()
  const params = useSearchParams()
  const { data: user, isLoading } = useAuth()

  useEffect(() => {
    // Only proceed if user is authenticated and not loading
    if (isLoading || !user) return

    try {
      // Check for stored auth context
      const storedContext = localStorage.getItem('auth_return_context')
      
      if (storedContext) {
        const context = JSON.parse(storedContext)
        const { originalUrl, redirectTo, timestamp } = context
        
        // Check if context is not too old (24 hours)
        const isRecent = Date.now() - timestamp < 24 * 60 * 60 * 1000
        
        if (isRecent) {
          // Clean up stored context
          localStorage.removeItem('auth_return_context')
          
          // Redirect to intended destination
          router.replace(redirectTo)
          return
        } else {
          // Context is too old, clean it up
          localStorage.removeItem('auth_return_context')
        }
      }
      
      // Fallback: redirect to sales page
      router.replace('/sales')
      
    } catch (error) {
      console.error('Error handling email verification return:', error)
      // Fallback: redirect to sales page
      router.replace('/sales')
    }
  }, [user, isLoading, router])

  // Show loading state while processing
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Completing your account setup...</p>
      </div>
    </div>
  )
}
