import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { setSessionCookies, isValidSession } from '@/lib/auth/server-session'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
})

async function signupHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const sanitizedBody = {
      ...body,
      email: typeof body?.email === 'string' ? body.email.trim() : body?.email,
    }
    const { email, password } = signupSchema.parse(sanitizedBody)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) {
      return NextResponse.json(
        {
          ok: false,
          code: 'CONFIG_ERROR',
          error: { message: 'Sign up is temporarily unavailable.' },
        },
        { status: 503 }
      )
    }

    const supabase = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    const emailRedirectTo = siteUrl ? `${siteUrl}/auth/callback` : undefined

    if (!emailRedirectTo && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] WARNING: NEXT_PUBLIC_SITE_URL not set, using Supabase default email redirect')
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-up redirect configured:', { event: 'signup', redirectToSet: !!emailRedirectTo })
    }

    const signUpOptions = emailRedirectTo ? { emailRedirectTo } : undefined
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...(signUpOptions ? { options: signUpOptions } : {}),
    })

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-up failed:', { event: 'signup', status: 'fail', code: error.message })
      }

      return NextResponse.json(
        {
          ok: false,
          code: 'SIGNUP_FAILED',
          error: { message: 'Failed to create account. Please try again.' },
          details: error.message,
        },
        { status: 400 }
      )
    }

    if (data.user && !data.session) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-up requires email confirmation:', { event: 'signup', status: 'confirmation-required' })
      }

      return NextResponse.json(
        {
          ok: true,
          data: {
            requiresConfirmation: true,
            message: 'Please check your email to confirm your account',
          },
        },
        { status: 201 }
      )
    }

    if (data.session && isValidSession(data.session) && data.user) {
      try {
        const profileResponse = await fetch(new URL('/api/profile', request.url), {
          method: 'POST',
          headers: {
            Cookie: request.headers.get('cookie') || '',
          },
        })

        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[AUTH] Profile ensured during signup:', {
              event: 'signup',
              created: profileData.created,
              userId: data.user.id,
            })
          }
        }
      } catch (profileError) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AUTH] Profile creation error during signup, but continuing:', profileError)
        }
      }

      const response = NextResponse.json(
        {
          ok: true,
          data: {
            user: {
              id: data.user.id,
              email: data.user.email,
            },
            message: 'Account created successfully',
          },
        },
        { status: 201 }
      )

      setSessionCookies(response, data.session)

      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Sign-up successful:', { event: 'signup', status: 'ok' })
      }

      return response
    }

    return NextResponse.json(
      {
        ok: true,
        data: { message: 'Account created successfully' },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          error: { message: 'Invalid input data' },
          details: JSON.stringify(error.errors),
        },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-up error:', error)
    }

    return NextResponse.json(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        error: { message: 'Internal server error' },
      },
      { status: 500 }
    )
  }
}

export const POST = withRateLimit(signupHandler, [
  Policies.AUTH_DEFAULT,
  Policies.AUTH_HOURLY,
])
