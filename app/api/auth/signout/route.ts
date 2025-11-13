import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = createSupabaseServerClient()
    
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('[AUTH/SIGNOUT] Sign-out error:', error)
      return NextResponse.json({ ok: false, code: 'SIGNOUT_FAILED', error: 'Failed to sign out' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred during sign out' }, 
      { status: 500 }
    )
  }
}
