import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, setSessionCookies, isValidSession } from '@/lib/auth/server-session'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
})

async function signupHandler(request: NextRequest) {

    const body = await request.json()
    const { email, password } = signupSchema.parse(body)

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Configure email redirect URL
    const emailRedirectTo = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      : undefined

    if (!emailRedirectTo && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] WARNING: NEXT_PUBLIC_SITE_URL not set, using Supabase default email redirect')
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-up redirect configured:', { event: 'signup', redirectToSet: !!emailRedirectTo })
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
      // Ensure profile exists for the user (idempotent)
      try {
        const profileResponse = await fetch(new URL('/api/profile', request.url), {
          method: 'POST',
          headers: {
            'Cookie': request.headers.get('cookie') || '',
          },
        })
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[AUTH] Profile ensured during signup:', { 
              event: 'signup', 
              created: profileData.created,
              userId: data.user.id 
            })
          }
        }
      } catch (profileError) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AUTH] Profile creation error during signup, but continuing:', profileError)
        }
        // Don't fail the auth flow if profile creation fails
      }

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

export const POST = withRateLimit(signupHandler, [
  Policies.AUTH_DEFAULT,
  Policies.AUTH_HOURLY
])
