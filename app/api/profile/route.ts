import { NextResponse, NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import { isAllowedAvatarUrl } from '@/lib/cloudinary'

export async function GET(_req: NextRequest) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] schema check profiles.bio')
  }

  const { data, error } = await sb
    .from('profiles_v2')
    .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
  return NextResponse.json({ ok: true, data })
}

export async function PUT(req: Request) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const json = await req.json()
  const parsed = ProfileUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid profile data', details: parsed.error.issues }, { status: 400 })
  }
  const payload = parsed.data
  if (payload.avatar_url && !isAllowedAvatarUrl(payload.avatar_url)) {
    return NextResponse.json({ ok: false, error: 'Avatar host not allowed' }, { status: 400 })
  }

  // Update using lootaura_v2.profiles directly (profiles_v2 is a view, may not support UPDATE)
  const { data, error } = await sb
    .from('profiles')
    .update({
      display_name: payload.display_name,
      bio: payload.bio ?? null,
      location_city: payload.location_city ?? null,
      location_region: payload.location_region ?? null,
      avatar_url: payload.avatar_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
    .maybeSingle()

  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ ok: false, error: error.message }, { status })
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] update profile success')
  }

  return NextResponse.json({ ok: true, data })
}

// Legacy handlers removed to avoid duplicate exports and name collisions
export async function POST(_request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  // Check existing
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('🔄 [AUTH FLOW] profile-creation → start: start', { userId: user.id })
  }

  const { data: existing, error: checkError } = await supabase
    .from('profiles_v2')
    .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
    .eq('id', user.id)
    .maybeSingle()
  if (checkError) return NextResponse.json({ ok: false, error: 'Failed to check existing profile', details: checkError.message }, { status: 500 })
  if (existing) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('✅ [AUTH FLOW] profile-creation → exists: success', { userId: user.id })
    }
    return NextResponse.json({ ok: true, data: existing, created: false, message: 'Profile already exists' })
  }

  // Insert into profiles_v2 view (which has INSERT permissions and forwards to lootaura_v2.profiles)
  const defaultProfile = {
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
    avatar_url: user.user_metadata?.avatar_url || null,
    home_zip: null,
    preferences: { notifications: { email: true, push: false }, privacy: { show_email: false, show_phone: false } },
  }
  const { error: createError, data: insertedData } = await supabase
    .from('profiles_v2')
    .insert(defaultProfile)
    .select()
    .single()
  if (createError) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('❌ [AUTH FLOW] profile-creation → insert error:', createError)
    }
    return NextResponse.json({ ok: false, error: 'Failed to create profile', details: createError.message }, { status: 500 })
  }
  
  // Fetch the created profile from the view to get all computed fields (username, etc.)
  const { data: profileData, error: fetchError } = await supabase
    .from('profiles_v2')
    .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
    .eq('id', user.id)
    .maybeSingle()
  
  if (fetchError || !profileData) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('❌ [AUTH FLOW] profile-creation → fetch error:', fetchError)
    }
    // If fetch fails but insert succeeded, try to construct a basic profile from inserted data
    if (insertedData) {
      const basicProfile = {
        id: insertedData.id,
        username: null,
        display_name: insertedData.display_name || defaultProfile.display_name,
        avatar_url: insertedData.avatar_url || null,
        bio: null,
        location_city: null,
        location_region: null,
        created_at: insertedData.created_at || new Date().toISOString(),
        verified: false,
        home_zip: insertedData.home_zip || null,
        preferences: insertedData.preferences || defaultProfile.preferences,
      }
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('✅ [AUTH FLOW] profile-creation → created: success (fallback)', { userId: user.id, profileId: basicProfile.id })
      }
      return NextResponse.json({ ok: true, data: basicProfile, created: true, message: 'Profile created successfully' })
    }
    return NextResponse.json({ ok: false, error: 'Profile created but failed to fetch', details: fetchError?.message }, { status: 500 })
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('✅ [AUTH FLOW] profile-creation → created: success', { userId: user.id, profileId: profileData.id })
  }
  return NextResponse.json({ ok: true, data: profileData, created: true, message: 'Profile created successfully' })
}
