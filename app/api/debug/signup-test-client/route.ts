/**
 * TEMPORARY DEBUG: @supabase/supabase-js createClient with same public env as browser client.
 * Mirrors lib/supabase/client.ts options (db schema + auth flags) on the server.
 * Remove after BUG-002 isolation.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEBUG_PASSWORD = 'Test123456!'

export async function GET() {
  const email = `debug3+${Date.now()}@gmail.com`
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return NextResponse.json(
      {
        ok: false,
        client: '@supabase/supabase-js createClient (browser-compatible options)',
        keyType: 'anon',
        data: null,
        error: { message: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY' },
      },
      { status: 500 }
    )
  }

  const supabase = createClient(url, anon, {
    db: { schema: 'public' },
    auth: {
      detectSessionInUrl: false,
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await supabase.auth.signUp({
    email,
    password: DEBUG_PASSWORD,
  })

  const errObj = error as (Error & { status?: number; code?: string }) | null

  return NextResponse.json({
    ok: !error,
    client:
      '@supabase/supabase-js createClient(url, anon, { db: { schema: "public" }, auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false } })',
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
  })
}
