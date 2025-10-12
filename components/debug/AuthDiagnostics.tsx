'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

interface AuthDiagnosticsProps {
  enabled?: boolean
}

export default function AuthDiagnostics({ enabled = false }: AuthDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<{
    providers: {
      email: boolean
      google: boolean
    }
    session: {
      isAuthenticated: boolean
      userId: string | null
      profileExists: boolean
    }
    events: string[]
  }>({
    providers: { email: false, google: false },
    session: { isAuthenticated: false, userId: null, profileExists: false },
    events: [],
  })

  useEffect(() => {
    if (!enabled || process.env.NEXT_PUBLIC_DEBUG !== 'true') return

    const supabase = createSupabaseBrowserClient()
    
    // Check provider availability
    const checkProviders = () => {
      const emailAvailable = !!process.env.NEXT_PUBLIC_SUPABASE_URL
      const googleAvailable = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      
      setDiagnostics(prev => ({
        ...prev,
        providers: {
          email: emailAvailable,
          google: googleAvailable,
        },
      }))

      if (!emailAvailable) {
        console.warn('[AUTH-DEBUG] Email provider not available: Missing NEXT_PUBLIC_SUPABASE_URL')
      }
      if (!googleAvailable) {
        console.warn('[AUTH-DEBUG] Google provider not available: Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID')
      }
    }

    // Check session and profile
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('[AUTH-DEBUG] Session check failed:', error.message)
          return
        }

        const isAuthenticated = !!session
        const userId = session?.user?.id || null
        
        setDiagnostics(prev => ({
          ...prev,
          session: {
            isAuthenticated,
            userId,
            profileExists: false, // Will be updated below
          },
        }))

        // Check if profile exists
        if (userId) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', userId)
            .single()

          if (profileError && profileError.code !== 'PGRST116') {
            console.error('[AUTH-DEBUG] Profile check failed:', profileError.message)
          }

          setDiagnostics(prev => ({
            ...prev,
            session: {
              ...prev.session,
              profileExists: !!profile,
            },
          }))

          if (!profile) {
            console.warn('[AUTH-DEBUG] Profile missing for user:', userId)
          }
        }
      } catch (error) {
        console.error('[AUTH-DEBUG] Session check error:', error)
      }
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const eventMessage = `[AUTH-DEBUG] Auth state change: ${event}`
      console.log(eventMessage)
      
      setDiagnostics(prev => ({
        ...prev,
        events: [...prev.events.slice(-9), eventMessage], // Keep last 10 events
      }))

      if (event === 'SIGNED_IN' && session?.user?.id) {
        console.log('[AUTH-DEBUG] User signed in:', session.user.id)
      } else if (event === 'SIGNED_OUT') {
        console.log('[AUTH-DEBUG] User signed out')
      }
    })

    // Initial checks
    checkProviders()
    checkSession()

    return () => {
      subscription.unsubscribe()
    }
  }, [enabled])

  if (!enabled || process.env.NEXT_PUBLIC_DEBUG !== 'true') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-w-sm z-50">
      <div className="font-bold mb-2">🔐 Auth Diagnostics</div>
      
      <div className="mb-2">
        <div className="font-semibold">Providers:</div>
        <div>Email: {diagnostics.providers.email ? '✅' : '❌'}</div>
        <div>Google: {diagnostics.providers.google ? '✅' : '❌'}</div>
      </div>

      <div className="mb-2">
        <div className="font-semibold">Session:</div>
        <div>Authenticated: {diagnostics.session.isAuthenticated ? '✅' : '❌'}</div>
        <div>User ID: {diagnostics.session.userId ? '✅' : '❌'}</div>
        <div>Profile: {diagnostics.session.profileExists ? '✅' : '❌'}</div>
      </div>

      {diagnostics.events.length > 0 && (
        <div>
          <div className="font-semibold">Recent Events:</div>
          <div className="max-h-20 overflow-y-auto">
            {diagnostics.events.map((event, index) => (
              <div key={index} className="text-xs opacity-75">
                {event}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
