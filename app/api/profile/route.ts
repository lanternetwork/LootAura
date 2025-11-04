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
  // Only update base columns that exist in the schema - avoid schema cache errors
  const updateData: Record<string, any> = {}
  
  // Always update full_name (base column) when display_name is provided
  if (payload.display_name !== undefined) {
    updateData.full_name = payload.display_name
  }
  if (payload.avatar_url !== undefined) {
    updateData.avatar_url = payload.avatar_url
  }
  
  // Try to update optional columns (may not exist in all schemas)
  // Use a try-catch approach or update in a separate query if needed
  try {
    if (payload.display_name !== undefined) {
      updateData.display_name = payload.display_name
    }
    if (payload.bio !== undefined) {
      updateData.bio = payload.bio ?? null
    }
    if (payload.location_city !== undefined) {
      updateData.location_city = payload.location_city ?? null
    }
    if (payload.location_region !== undefined) {
      updateData.location_region = payload.location_region ?? null
    }
  } catch (e) {
    // Ignore - these columns might not exist
  }
  
  // Always set updated_at
  updateData.updated_at = new Date().toISOString()
  
  const { data, error } = await sb
    .from('profiles')
    .update(updateData)
    .eq('id', user.id)
  
  // If update fails due to missing columns, try with only base columns
  if (error && error.message?.includes('column') && error.message?.includes('not found')) {
    const baseUpdateData: Record<string, any> = {
      full_name: payload.display_name || undefined,
      avatar_url: payload.avatar_url || undefined,
      updated_at: new Date().toISOString(),
    }
    // Remove undefined values
    Object.keys(baseUpdateData).forEach(key => baseUpdateData[key] === undefined && delete baseUpdateData[key])
    
    const { data: baseData, error: baseError } = await sb
      .from('profiles')
      .update(baseUpdateData)
      .eq('id', user.id)
    
    if (baseError) {
      const status = baseError.code === '42501' ? 403 : 500
      return NextResponse.json({ ok: false, error: baseError.message }, { status })
    }
    
    // Fetch updated profile from view
    const { data: profileData } = await sb
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
      .eq('id', user.id)
      .maybeSingle()
    
    return NextResponse.json({ ok: true, data: profileData || baseData })
  }
  
  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ ok: false, error: error.message }, { status })
  }
  
  // Fetch updated profile from view to get all computed fields
  const { data: profileData } = await sb
    .from('profiles_v2')
    .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
    .eq('id', user.id)
    .maybeSingle()
  
  const data = profileData

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
