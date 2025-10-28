import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
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
    const { email } = resetPasswordSchema.parse(body)

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Configure email redirect URL
    const emailRedirectTo = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`
      : undefined

    if (!emailRedirectTo && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] WARNING: NEXT_PUBLIC_SITE_URL not set, using Supabase default email redirect')
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Password reset request:', { event: 'password-reset', email, redirectToSet: !!emailRedirectTo })
    }

    // Send password reset email
    const { data: _data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: emailRedirectTo,
    })

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Password reset failed:', { event: 'password-reset', status: 'fail', code: error.message })
      }
      
      return NextResponse.json(
        { code: error.message, message: 'Failed to send password reset email' },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Password reset sent:', { event: 'password-reset', status: 'ok' })
    }

    return NextResponse.json(
      { 
        message: 'Password reset email sent! Check your email to reset your password.',
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
      console.log('[AUTH] Password reset error:', error)
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
