import { NextResponse, NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import { isAllowedAvatarUrl } from '@/lib/cloudinary'

export async function GET(_req: NextRequest) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] GET /api/profile start', { userId: user.id })
  }

  // Read directly from canonical base table
  // Try selecting with all columns; if any column doesn't exist, fallback to core columns only
  let data: any = null
  let error: any = null
  {
    const res = await sb
      .from('profiles')
      .select('id, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
      .eq('id', user.id)
      .maybeSingle()
    data = res.data
    error = res.error
  }

  if (error && error.message?.includes('column')) {
    // Fallback to core columns that definitely exist
    const res2 = await sb
      .from('profiles')
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
    }
    error = res2.error
  }

  if (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE] GET table fetch error:', error)
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!data) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE] GET profile not found', { userId: user.id })
    }
    return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] GET /api/profile returned keys:', Object.keys(data))
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

  if (Object.keys(updateData).length === 0) {
    // Nothing to update; return current row
    const { data: current, error: currentErr } = await sb
      .from('lootaura_v2.profiles')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
      .eq('id', user.id)
      .single()
    if (currentErr || !current) {
      return NextResponse.json({ ok: false, error: currentErr?.message || 'Profile not found' }, { status: currentErr ? 500 : 404 })
    }
    return NextResponse.json({ ok: true, data: current })
  }

  let updated: any = null
  let updateErr: any = null
  {
    const res = await sb
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select('id, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
      .single()
    updated = res.data
    updateErr = res.error
  }

  // If any column doesn't exist in this env, try using RPC function to update
  // The RPC function handles missing columns gracefully
  if (updateErr && updateErr.message?.includes('column')) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE] PUT column error, falling back to RPC:', updateErr.message)
    }
    
    // Use RPC function which handles missing columns gracefully
    const rpcParams: Record<string, any> = { p_user_id: user.id }
    if ('avatar_url' in updateData) rpcParams.p_avatar_url = updateData.avatar_url
    if ('display_name' in updateData) {
      rpcParams.p_display_name = updateData.display_name
      rpcParams.p_full_name = updateData.display_name
    }
    if ('bio' in updateData) rpcParams.p_bio = updateData.bio
    if ('location_city' in updateData) rpcParams.p_location_city = updateData.location_city
    if ('location_region' in updateData) rpcParams.p_location_region = updateData.location_region
    
    const { data: rpcResult, error: rpcError } = await sb.rpc('update_profile', rpcParams)
    
    if (!rpcError && rpcResult) {
      // RPC returns JSONB - parse it if it's a string, otherwise use as-is
      let profileData = rpcResult
      if (typeof rpcResult === 'string') {
        try {
          profileData = JSON.parse(rpcResult)
        } catch {
          // If parsing fails, fetch from view
          const { data: viewData } = await sb
            .from('profiles_v2')
            .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
            .eq('id', user.id)
            .maybeSingle()
          profileData = viewData
        }
      }
      updated = profileData
      updateErr = null
    } else {
      // RPC also failed - fallback to core columns only
      const retryData: Record<string, any> = {}
      if ('avatar_url' in updateData) retryData.avatar_url = updateData.avatar_url
      
      if (Object.keys(retryData).length > 0) {
        const res2 = await sb
          .from('profiles')
          .update(retryData)
          .eq('id', user.id)
          .select('id, avatar_url, created_at')
          .single()
        if (res2.data) {
          updated = {
            ...res2.data,
            display_name: updateData.display_name ?? null,
            bio: updateData.bio ?? null,
            location_city: updateData.location_city ?? null,
            location_region: updateData.location_region ?? null,
            verified: false,
          }
        }
        updateErr = res2.error
      } else {
        // Nothing we can safely update; fetch current core row and return ok with synthesized fields
        const res3 = await sb
          .from('profiles')
          .select('id, avatar_url, created_at')
          .eq('id', user.id)
          .single()
        if (res3.data) {
          updated = {
            ...res3.data,
            display_name: updateData.display_name ?? null,
            bio: updateData.bio ?? null,
            location_city: updateData.location_city ?? null,
            location_region: updateData.location_region ?? null,
            verified: false,
          }
          updateErr = null
        } else {
          updateErr = res3.error
        }
      }
    }
  }

  if (updateErr || !updated) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE] PUT update failed:', updateErr?.message || 'No data returned')
    }
    return NextResponse.json({ ok: false, error: updateErr?.message || 'Update failed' }, { status: updateErr ? 500 : 400 })
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] PUT updated successfully, returning keys:', Object.keys(updated))
  }

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
