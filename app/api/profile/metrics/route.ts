import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') console.log('[PROFILE] metrics get')
  // First pass: return stub numbers (to be replaced with real aggregates)
  return NextResponse.json({ views7d: 123, saves7d: 7, ctr7d: 2.1, salesFulfilled: 3 })
}


