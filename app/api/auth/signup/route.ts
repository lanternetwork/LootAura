import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, setSessionCookies, isValidSession } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = signupSchema.parse(body)

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Attempt to sign up with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-up failed:', { event: 'signup', status: 'fail', error: error.message })
      }
      
      return NextResponse.json(
        { error: 'Failed to create account' },
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
        console.log('[AUTH] Sign-up successful:', { event: 'signup', status: 'ok', userId: data.user.id })
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
