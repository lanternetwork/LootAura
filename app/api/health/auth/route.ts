import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Check if there's a session cookie present
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        hasSession: false,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      hasSession: !!user,
      isAuthenticated: !!user,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    // Handle missing environment variables gracefully
    if (error instanceof Error && error.message.includes('is missing')) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        hasSession: false,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
    
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown auth error',
      hasSession: false,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
