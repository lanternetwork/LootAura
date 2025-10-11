import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const envVars = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SUPABASE_SCHEMA: !!process.env.NEXT_PUBLIC_SUPABASE_SCHEMA,
      // Prefer public Mapbox tokens used by the client
      NEXT_PUBLIC_MAPBOX_TOKEN: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN || !!process.env.NEXT_PUBLIC_MAPBOX_MAP_TOKEN
    }

    const allPresent = Object.values(envVars).every(Boolean)

    return NextResponse.json({
      ok: allPresent,
      env: envVars,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
