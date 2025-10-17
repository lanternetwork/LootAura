import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

const resendSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = resendSchema.parse(body)

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Resend confirmation email
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Resend failed:', { event: 'resend', status: 'fail', code: error.message })
      }
      
      return NextResponse.json(
        { code: error.message, message: 'Auth failed' },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Resend successful:', { event: 'resend', status: 'ok' })
    }

    return NextResponse.json(
      { message: 'Confirmation email sent' },
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
      console.log('[AUTH] Resend error:', error)
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
