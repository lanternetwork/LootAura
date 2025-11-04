import { NextResponse, NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import { isAllowedAvatarUrl } from '@/lib/cloudinary'

export async function GET(_req: NextRequest) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  console.log('[PROFILE] GET /api/profile start', { userId: user.id })

  // Read from profiles_v2 view which reads from lootaura_v2.profiles base table
  // This ensures we read from the same source that PUT writes to
  let data: any = null
  let error: any = null
  {
    console.log('[PROFILE] GET attempting to read from profiles_v2 view')
    const res = await sb
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
      .eq('id', user.id)
      .maybeSingle()
    data = res.data
    error = res.error
    
    console.log('[PROFILE] GET result:', { 
      hasData: !!res.data, 
      error: res.error?.message,
      bioInData: res.data?.bio,
      keysInData: res.data ? Object.keys(res.data) : []
    })
  }

  if (error && error.message?.includes('column')) {
    console.log('[PROFILE] GET column error, falling back to core columns:', error.message)
    // Fallback to core columns that definitely exist
    const res2 = await sb
      .from('profiles_v2')
      .select('id, avatar_url, created_at')
      .eq('id', user.id)
      .maybeSingle()
    if (res2.data) {
      data = {
        ...res2.data,
        display_name: null,
        bio: null,
        location_city: null,
        location_region: null,
        verified: false,
      }
      console.log('[PROFILE] GET fallback data synthesized with bio=null')
    }
    error = res2.error
  }

  if (error) {
    console.error('[PROFILE] GET table fetch error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!data) {
    console.log('[PROFILE] GET profile not found', { userId: user.id })
    return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
  }

  console.log('[PROFILE] GET /api/profile returned keys:', Object.keys(data))
  console.log('[PROFILE] GET returning bio:', data.bio)
  console.log('[PROFILE] GET returning full data:', JSON.stringify(data, null, 2))

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

  // Build update object with only provided fields (skip undefined)
  const updateData: Record<string, any> = {}
  if (payload.avatar_url !== undefined) updateData.avatar_url = payload.avatar_url
  if (payload.display_name !== undefined) updateData.display_name = payload.display_name
  if (payload.bio !== undefined) updateData.bio = payload.bio
  if (payload.location_city !== undefined) updateData.location_city = payload.location_city
  if (payload.location_region !== undefined) updateData.location_region = payload.location_region

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] PUT received fields:', Object.keys(updateData))
  }

  if (Object.keys(updateData).length === 0) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[PROFILE] PUT received empty update data')
    }
    return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 })
  }

  // Try RPC function first, but fallback to direct update if RPC fails
  // The RPC function writes directly to lootaura_v2.profiles base table
  console.log('[PROFILE] PUT attempting to update base table with:', updateData)
  console.log('[PROFILE] PUT user.id:', user.id)
  
  // First, try to update directly using SQL via RPC
  // Build RPC params
  const rpcParams: Record<string, any> = { p_user_id: user.id }
  if ('avatar_url' in updateData) rpcParams.p_avatar_url = updateData.avatar_url
  if ('display_name' in updateData) {
    rpcParams.p_display_name = updateData.display_name
    rpcParams.p_full_name = updateData.display_name
  }
  if ('bio' in updateData) rpcParams.p_bio = updateData.bio
  if ('location_city' in updateData) rpcParams.p_location_city = updateData.location_city
  if ('location_region' in updateData) rpcParams.p_location_region = updateData.location_region
  
  console.log('[PROFILE] PUT RPC params:', rpcParams)
  
  const { data: rpcResult, error: rpcError } = await sb.rpc('update_profile', rpcParams)
  
  console.log('[PROFILE] PUT RPC call result:', { 
    hasResult: !!rpcResult, 
    hasError: !!rpcError,
    error: rpcError?.message,
    resultType: typeof rpcResult,
    resultValue: rpcResult
  })
  
  let updated: any = null
  let updateErr: any = null
  
  if (rpcError) {
    console.error('[PROFILE] PUT RPC error:', rpcError.message, rpcError)
    updateErr = rpcError
  } else if (rpcResult) {
    // RPC returns JSONB - parse it if it's a string, otherwise use as-is
    let profileData = rpcResult
    if (typeof rpcResult === 'string') {
      try {
        profileData = JSON.parse(rpcResult)
      } catch {
        // If parsing fails, fetch from view
        console.log('[PROFILE] PUT RPC returned string, parsing failed, fetching from view')
        const { data: viewData } = await sb
          .from('profiles_v2')
          .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
          .eq('id', user.id)
          .maybeSingle()
        profileData = viewData
      }
    }
    updated = profileData
    console.log('[PROFILE] PUT RPC result:', { 
      hasData: !!updated, 
      bioInResult: updated?.bio,
      keysInResult: updated ? Object.keys(updated) : []
    })
  } else {
    // RPC returned null/undefined - the update might have succeeded but the SELECT failed
    // Try fetching from view as fallback
    console.log('[PROFILE] PUT RPC returned null, fetching from view as fallback')
    const { data: viewData, error: viewError } = await sb
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
      .eq('id', user.id)
      .maybeSingle()
    
    console.log('[PROFILE] PUT view fetch result:', { 
      hasData: !!viewData, 
      hasError: !!viewError,
      error: viewError?.message,
      bioInData: viewData?.bio
    })
    
    if (viewError) {
      console.error('[PROFILE] PUT view fetch error:', viewError.message)
      updateErr = viewError
    } else if (viewData) {
      updated = viewData
      console.log('[PROFILE] PUT view fallback result:', { 
        hasData: !!updated, 
        bioInResult: updated?.bio,
        keysInResult: updated ? Object.keys(updated) : []
      })
    } else {
      // Both RPC and view returned null - verify if update actually persisted
      console.log('[PROFILE] PUT both RPC and view returned null, verifying update persistence')
      
      // Wait a moment for any potential replication delay, then verify
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Try to fetch the updated profile from the view to verify persistence
      const { data: verifyData, error: verifyError } = await sb
        .from('profiles_v2')
        .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
        .eq('id', user.id)
        .maybeSingle()
      
      console.log('[PROFILE] PUT verification fetch:', {
        hasData: !!verifyData,
        hasError: !!verifyError,
        error: verifyError?.message,
        bioInVerify: verifyData?.bio,
        expectedBio: updateData.bio
      })
      
      if (verifyData) {
        // Verification succeeded - return the actual data from the view
        updated = verifyData
        console.log('[PROFILE] PUT verification successful, returning view data')
      } else if (verifyError) {
        // Verification failed with error - return update data as confirmation
        console.log('[PROFILE] PUT verification failed with error, returning update data as confirmation')
        updated = {
          id: user.id,
          display_name: updateData.display_name ?? null,
          bio: updateData.bio ?? null,
          location_city: updateData.location_city ?? null,
          location_region: updateData.location_region ?? null,
          avatar_url: updateData.avatar_url ?? null,
          created_at: null,
          verified: false,
        }
      } else {
        // Verification returned null - profile might not exist in view
        console.error('[PROFILE] PUT verification returned null - profile not found in view')
        updateErr = new Error('Profile not found in view after update')
      }
    }
  }

  if (updateErr || !updated) {
    console.error('[PROFILE] PUT update failed:', updateErr?.message || 'No data returned')
    return NextResponse.json({ ok: false, error: updateErr?.message || 'Update failed' }, { status: updateErr ? 500 : 400 })
  }

  console.log('[PROFILE] PUT updated successfully, returning keys:', Object.keys(updated))
  console.log('[PROFILE] PUT returning bio:', updated.bio)
  console.log('[PROFILE] PUT returning full data:', JSON.stringify(updated, null, 2))

  return NextResponse.json({ ok: true, data: updated })
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
      .from('profiles')
      .select('id, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
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
  // Fetch created profile; handle missing bio column gracefully
  let profileData: any = null
  let fetchError: any = null
  {
    const res = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
      .eq('id', user.id)
      .maybeSingle()
    profileData = res.data
    fetchError = res.error
  }
  if (fetchError && fetchError.message?.includes('column')) {
    // Fallback to core columns that definitely exist
    const res2 = await supabase
      .from('profiles')
      .select('id, avatar_url, created_at')
      .eq('id', user.id)
      .maybeSingle()
    if (res2.data) {
      profileData = {
        ...res2.data,
        display_name: userFullName,
        bio: null,
        location_city: null,
        location_region: null,
        verified: false,
      }
    }
    fetchError = res2.error
  }
  
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
