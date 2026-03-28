/**
 * TEMPORARY DEBUG: signUp via createServerSupabaseClient (SSR cookie-bound client).
 * Remove after BUG-002 isolation.
 */
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'

export const dynamic = 'force-dynamic'

const DEBUG_EMAIL = 'directtest5@gmail.com'
const DEBUG_PASSWORD = 'Test123456!'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return NextResponse.json(
      {
        ok: false,
        client: 'createServerSupabaseClient(cookies()) from @/lib/auth/server-session',
        keyType: 'anon',
        data: null,
        error: { message: 'Missing Supabase env' },
      },
      { status: 500 }
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerSupabaseClient(cookieStore)

  const emailRedirectTo = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    : undefined

  const { data, error } = await supabase.auth.signUp({
    email: DEBUG_EMAIL,
    password: DEBUG_PASSWORD,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  })

  const errObj = error as (Error & { status?: number; code?: string }) | null

  return NextResponse.json({
    ok: !error,
    client:
      'createServerSupabaseClient(await cookies()) — @supabase/ssr createServerClient + anon key + cookie adapter',
    keyType: 'anon',
    data,
    error: error
      ? {
          message: errObj?.message,
          status: errObj?.status ?? null,
          name: errObj?.name,
          code: errObj?.code ?? null,
        }
      : null,
    emailRedirectTo: emailRedirectTo ?? null,
  })
}
