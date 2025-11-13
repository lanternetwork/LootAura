import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const updatePasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMITS.AUTH)
    const { allowed, error: rateLimitError } = rateLimitMiddleware(request)
    
    if (!allowed) {
      return NextResponse.json(
        { error: rateLimitError },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { password, access_token, refresh_token } = updatePasswordSchema.parse(body)

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // If tokens are provided, set the session first
    if (access_token && refresh_token) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      })

      if (sessionError || !sessionData.session) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AUTH] Session setting failed:', { event: 'password-update', status: 'fail', code: sessionError?.message })
        }
        
        return NextResponse.json(
          { code: sessionError?.message || 'Invalid session', message: 'Failed to set session' },
          { status: 401 }
        )
      }
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Password update request:', { event: 'password-update' })
    }

    // Update password
    const { data: _data, error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Password update failed:', { event: 'password-update', status: 'fail', code: error.message })
      }
      
      return NextResponse.json(
        { ok: false, code: 'PASSWORD_UPDATE_FAILED', error: 'Failed to update password. Please try again.' },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Password update successful:', { event: 'password-update', status: 'ok' })
    }

    return NextResponse.json(
      { 
        message: 'Password updated successfully',
        success: true
      },
      { status: 200 }
    )

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Password update error:', error)
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
