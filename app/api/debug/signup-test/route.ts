/**
 * TEMPORARY DEBUG: server-side Supabase signUp isolation (BUG-002).
 * Remove this route after testing. Do not rely on in production.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEBUG_EMAIL = 'directtest@gmail.com'
const DEBUG_PASSWORD = 'Test123456!'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: { message: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        errorMessage: 'Missing env',
        errorStatus: null,
      },
      { status: 500 }
    )
  }

  const supabase = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await supabase.auth.signUp({
    email: DEBUG_EMAIL,
    password: DEBUG_PASSWORD,
  })

  const errObj = error as (Error & { status?: number; code?: string }) | null

  return NextResponse.json({
    ok: !error,
    data,
    error: error
      ? {
          message: errObj?.message,
          status: errObj?.status ?? null,
          name: errObj?.name,
          code: errObj?.code ?? null,
        }
      : null,
    errorMessage: error?.message ?? null,
    errorStatus: errObj?.status ?? null,
  })
}
