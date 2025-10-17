import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, setSessionCookies, isValidSession } from '@/lib/auth/server-session'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'
import { cookies } from 'next/headers'

const signinSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
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
    const { email, password } = signinSchema.parse(body)

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Attempt to sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session || !isValidSession(data.session)) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-in failed:', { event: 'signin', status: 'fail', code: error?.message })
      }
      
      return NextResponse.json(
        { code: error?.message || 'Invalid session', message: 'Auth failed' },
        { status: 401 }
      )
    }

    // Create response and set session cookies
    const response = NextResponse.json(
      { 
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        message: 'Sign in successful'
      },
      { status: 200 }
    )

    setSessionCookies(response, data.session)

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-in successful:', { event: 'signin', status: 'ok' })
    }

    return response

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-in error:', error)
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
