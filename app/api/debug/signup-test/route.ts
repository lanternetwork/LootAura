/**
 * TEMPORARY DEBUG: server-side Supabase signUp isolation (BUG-002).
 * Remove this route after testing. Do not rely on in production.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEBUG_PASSWORD = 'Test123456!'

export async function GET() {
  const email = `debug1+${Date.now()}@gmail.com`
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
    email,
    password: DEBUG_PASSWORD,
  })

  const errObj = error as (Error & { status?: number; code?: string }) | null

  return NextResponse.json({
    implementation: {
      file: 'app/api/debug/signup-test/route.ts',
      client: '@supabase/supabase-js createClient',
      envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
      keyType: 'anon',
      api: 'supabase.auth.signUp (not Admin API)',
    },
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
