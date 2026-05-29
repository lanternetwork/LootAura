import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'
import {
  decodeRedirectParam,
  ensureUserProfile,
  sanitizeAuthRedirect,
} from '@/lib/auth/authCallbackShared'

export const dynamic = 'force-dynamic'

const establishSessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  redirectTo: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMITS.AUTH)
    const { allowed, error: rateLimitError } = rateLimitMiddleware(request)

    if (!allowed) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 })
    }

    const body = await request.json()
    const { access_token, refresh_token, redirectTo: redirectParam } =
      establishSessionSchema.parse(body)

    const cookieStore = await cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (sessionError || !data.session) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] establish-session failed:', sessionError?.message)
      }
      return NextResponse.json(
        { ok: false, code: 'INVALID_SESSION', error: 'Failed to establish session' },
        { status: 401 }
      )
    }

    const origin = new URL(request.url).origin
    await ensureUserProfile(origin, request.headers.get('cookie') || '')

    const redirectTo = sanitizeAuthRedirect(
      redirectParam ? decodeRedirectParam(redirectParam) : '/sales',
      origin
    )

    return NextResponse.json({
      ok: true,
      success: true,
      redirectTo,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, code: 'VALIDATION_ERROR', error: 'Invalid input data' },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] establish-session error:', error)
    }

    return NextResponse.json(
      { ok: false, code: 'INTERNAL_ERROR', error: 'Internal server error' },
      { status: 500 }
    )
  }
}
