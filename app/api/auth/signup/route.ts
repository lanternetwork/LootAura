import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, setSessionCookies, isValidSession } from '@/lib/auth/server-session'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  returnTo: z.string().optional(),
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
    const { email, password } = signupSchema.parse(body)

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Configure email redirect URL with returnTo parameter
    const returnTo = body.returnTo || '/sales'
    const emailRedirectTo = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`
      : `${request.nextUrl.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`

    if (!process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] WARNING: NEXT_PUBLIC_SITE_URL not set, using request origin for email redirect')
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-up redirect configured:', { event: 'signup', redirectToSet: !!emailRedirectTo, returnTo })
    }

    // Attempt to sign up with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo }
    })

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-up failed:', { event: 'signup', status: 'fail', code: error.message })
      }
      
      return NextResponse.json(
        { code: error.message, message: 'Auth failed' },
        { status: 400 }
      )
    }

    // Check if email confirmation is required
    if (data.user && !data.session) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-up requires email confirmation:', { event: 'signup', status: 'confirmation-required' })
      }
      
      return NextResponse.json(
        { 
          message: 'Please check your email to confirm your account',
          requiresConfirmation: true
        },
        { status: 201 }
      )
    }

    // If session is available and valid, set cookies
    if (data.session && isValidSession(data.session) && data.user) {
      const response = NextResponse.json(
        { 
          user: {
            id: data.user.id,
            email: data.user.email,
          },
          message: 'Account created successfully'
        },
        { status: 201 }
      )

      setSessionCookies(response, data.session)

      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-up successful:', { event: 'signup', status: 'ok' })
      }

      return response
    }

    // Fallback response
    return NextResponse.json(
      { message: 'Account created successfully' },
      { status: 201 }
    )

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-up error:', error)
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
