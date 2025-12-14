import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { deriveCategories } from '@/lib/profile/deriveCategories'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const username = url.searchParams.get('username') || ''
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })
  const supabase = createSupabaseServerClient()
  let profile = null as any
  // Try by username column; fallback to id
  const byUser = await supabase.from('profiles_v2').select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified').eq('username', username).maybeSingle()
  if (byUser.data) profile = byUser.data
  if (!profile) {
    const byId = await supabase.from('profiles_v2').select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified').eq('id', username).maybeSingle()
    profile = byId.data
  }
  // No fallback to base table - profiles_v2 view is the only source for public profile data
  // This ensures anon users cannot access sensitive fields (lock fields, email prefs) from base table
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') console.log('[PROFILE] get public profile', { username })
  const preferred = await deriveCategories(profile.id).catch(() => [])
  
  // Add cache headers for public profile data (profiles change infrequently)
  const { addCacheHeaders } = await import('@/lib/http/cache')
  const response = NextResponse.json({ profile, preferred })
  return addCacheHeaders(response, {
    maxAge: 60, // 1 minute client cache
    sMaxAge: 300, // 5 minutes CDN cache (profiles change infrequently)
    staleWhileRevalidate: 120,
    public: true
  })
}


