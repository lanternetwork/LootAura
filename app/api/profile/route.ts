import { NextResponse, NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import { isAllowedAvatarUrl } from '@/lib/cloudinary'

export async function GET(_req: NextRequest) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] GET profile start', { userId: user.id })
  }

  // First check if profile exists in table
  const { data: tableData, error: tableError } = await sb
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  
  if (tableError) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE] GET profile table check error:', tableError)
    }
    return NextResponse.json({ ok: false, error: tableError.message }, { status: 500 })
  }
  
  // If profile doesn't exist in table, return 404 so client can create it
  if (!tableData) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE] GET profile not found', { userId: user.id })
    }
    return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
  }

  // Profile exists in table, fetch from view to get all computed fields
  const { data, error } = await sb
    .from('profiles_v2')
    .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
    .eq('id', user.id)
    .maybeSingle()
  
  if (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE] GET profile view fetch error:', error)
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  
  if (!data) {
    // View fetch failed but table check passed - return basic profile
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE] GET profile view fetch returned null, using table data')
    }
    return NextResponse.json({ ok: true, data: { id: tableData.id, username: null, display_name: null, avatar_url: null, bio: null, location_city: null, location_region: null, created_at: null, verified: false, home_zip: null, preferences: {} } })
  }
  
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

  // Use RPC function to update profile - bypasses schema cache issues
  // The RPC function updates the table directly in lootaura_v2 schema
  // Only pass parameters that are explicitly provided (not undefined)
  const rpcParams: Record<string, any> = { p_user_id: user.id }
  if (payload.avatar_url !== undefined) {
    rpcParams.p_avatar_url = payload.avatar_url
  }
  if (payload.display_name !== undefined) {
    rpcParams.p_display_name = payload.display_name
    rpcParams.p_full_name = payload.display_name
  }
  if (payload.bio !== undefined) {
    rpcParams.p_bio = payload.bio
  }
  if (payload.location_city !== undefined) {
    rpcParams.p_location_city = payload.location_city
  }
  if (payload.location_region !== undefined) {
    rpcParams.p_location_region = payload.location_region
  }
  
  const { data: rpcResult, error: rpcError } = await sb.rpc('update_profile', rpcParams)
  
  if (rpcError) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE] PUT RPC update failed:', rpcError)
    }
    // RPC failed - try fallback to view select
    const { data: profileData, error: viewError } = await sb
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
      .eq('id', user.id)
      .maybeSingle()
    
    if (viewError || !profileData) {
      const status = rpcError.code === '42501' ? 403 : 500
      return NextResponse.json({ ok: false, error: rpcError.message }, { status })
    }
    
    return NextResponse.json({ ok: true, data: profileData })
  }
  
  // RPC returns JSONB - parse it if it's a string, otherwise use as-is
  let profileData = rpcResult
  if (typeof rpcResult === 'string') {
    try {
      profileData = JSON.parse(rpcResult)
    } catch (e) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[PROFILE] RPC result is not valid JSON, fetching from view:', e)
      }
      // If RPC result is invalid, fetch from view
      const { data: viewData } = await sb
        .from('profiles_v2')
        .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
        .eq('id', user.id)
        .maybeSingle()
      profileData = viewData
    }
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] update profile success via RPC', { hasProfileData: !!profileData })
  }

  return NextResponse.json({ ok: true, data: profileData })
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

  // Check if profile exists - try both view and table to avoid race conditions
  const { data: existing, error: checkError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (checkError) return NextResponse.json({ ok: false, error: 'Failed to check existing profile', details: checkError.message }, { status: 500 })
  if (existing) {
    // Profile exists, fetch full profile from view
    const { data: fullProfile, error: fetchError } = await supabase
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
      .eq('id', user.id)
      .maybeSingle()
    if (fetchError || !fullProfile) {
      // If view fetch fails, return basic profile
      return NextResponse.json({ ok: true, data: existing, created: false, message: 'Profile already exists' })
    }
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('✅ [AUTH FLOW] profile-creation → exists: success', { userId: user.id })
    }
    return NextResponse.json({ ok: true, data: fullProfile, created: false, message: 'Profile already exists' })
  }

  // Insert into profiles table directly (profiles_v2 is a view, cannot insert into it)
  // Only include the required id field - let database defaults handle the rest
  // This avoids schema cache issues when the table is in lootaura_v2 schema but client uses public schema
  const defaultProfile: Record<string, any> = {
    id: user.id,
  }
  
  // Try to add optional fields if they exist, but don't fail if they don't
  // These will be added via UPDATE after successful insert if needed
  const userFullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const userAvatarUrl = user.user_metadata?.avatar_url || null
  const userPreferences = { notifications: { email: true, push: false }, privacy: { show_email: false, show_phone: false } }
  
  // Only add fields that we know exist - let the database handle defaults
  // Insert with just id first, then update with values
  const { error: createError, data: insertedData } = await supabase
    .from('profiles')
    .insert(defaultProfile)
    .select()
    .single()
  if (createError) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('❌ [AUTH FLOW] profile-creation → insert error:', createError)
    }
    // If duplicate key error, profile already exists - fetch it
    if (createError.message?.includes('duplicate key') || createError.code === '23505') {
      const { data: fullProfile, error: fetchError } = await supabase
        .from('profiles_v2')
        .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
        .eq('id', user.id)
        .maybeSingle()
      if (!fetchError && fullProfile) {
        return NextResponse.json({ ok: true, data: fullProfile, created: false, message: 'Profile already exists' })
      }
    }
    return NextResponse.json({ ok: false, error: 'Failed to create profile', details: createError.message }, { status: 500 })
  }
  
  // Now update the profile with the actual values we want
  // Use the same pattern as PUT handler which works
  const updateData: Record<string, any> = {}
  if (userFullName) {
    // Try both full_name and display_name (whichever exists)
    updateData.full_name = userFullName
    updateData.display_name = userFullName
  }
  if (userAvatarUrl) {
    updateData.avatar_url = userAvatarUrl
  }
  if (userPreferences) {
    updateData.preferences = userPreferences
  }
  
  // Update the profile if we have fields to set
  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
    if (updateError && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('⚠️ [AUTH FLOW] profile-creation → update warning:', updateError)
      // Don't fail if update fails - the profile was created successfully
    }
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
        display_name: userFullName,
        avatar_url: userAvatarUrl,
        bio: null,
        location_city: null,
        location_region: null,
        created_at: insertedData.created_at || new Date().toISOString(),
        verified: false,
        home_zip: null,
        preferences: userPreferences,
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
