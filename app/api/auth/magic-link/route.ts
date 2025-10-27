import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'
import { cookies } from 'next/headers'
import { authDebug } from '@/lib/debug/authDebug'

export const dynamic = 'force-dynamic'

const magicLinkSchema = z.object({
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
    
    let email: string
    try {
      const parsed = magicLinkSchema.parse(body)
      email = parsed.email
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { code: error.errors[0].message, message: 'Invalid email address' },
          { status: 400 }
        )
      }
      throw error
    }

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Configure email redirect URL
    const emailRedirectTo = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      : undefined

    if (!emailRedirectTo && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] WARNING: NEXT_PUBLIC_SITE_URL not set, using Supabase default email redirect')
    }

    authDebug.logMagicLink(email, 'sent', { redirectToSet: !!emailRedirectTo })

    // Send magic link
    const { data: _data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true, // Allow new users to sign up via magic link
      }
    })

    if (error) {
      authDebug.logMagicLink(email, 'error', { code: error.message })
      
      return NextResponse.json(
        { code: error.message, message: 'Failed to send magic link' },
        { status: 400 }
      )
    }

    authDebug.logMagicLink(email, 'sent')

    return NextResponse.json(
      { 
        message: 'Magic link sent! Check your email to sign in.',
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
      console.log('[AUTH] Magic link error:', error)
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
