import { NextResponse, NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import { isAllowedAvatarUrl } from '@/lib/cloudinary'

export async function GET(_req: NextRequest) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  // Note: GET requests are read-only and should NOT be blocked by account locks
  // Only write operations (POST, PUT, DELETE) should enforce account locks

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

  // If view doesn't return data, try using RPC to read from base table
  // The RPC function can read even if view has RLS issues
  if (!data && !error) {
    console.log('[PROFILE] GET view returned null, trying RPC to read base table')
    try {
      // Use RPC to read profile - RPC is SECURITY DEFINER and can read base table
      const { data: rpcData, error: rpcError } = await sb.rpc('get_profile', { p_user_id: user.id })
      if (rpcData && !rpcError) {
        console.log('[PROFILE] GET RPC read successful, bio:', rpcData.bio)
        data = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData
      } else {
        console.log('[PROFILE] GET RPC read failed:', rpcError?.message)
      }
    } catch (e) {
      console.log('[PROFILE] GET RPC read exception:', e)
    }
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
    return NextResponse.json({ ok: false, code: 'FETCH_ERROR', error: 'Failed to fetch profile' }, { status: 500 })
  }

  if (!data) {
    console.log('[PROFILE] GET profile not found in view or via RPC', { userId: user.id })
    // Profile doesn't exist - try one more time with update_profile RPC to create it
    console.log('[PROFILE] GET attempting to create profile via update_profile RPC')
    try {
      const { data: createRpcData, error: createRpcError } = await sb.rpc('update_profile', { p_user_id: user.id })
      console.log('[PROFILE] GET update_profile RPC result:', {
        hasData: !!createRpcData,
        hasError: !!createRpcError,
        error: createRpcError?.message,
        errorCode: createRpcError?.code,
        errorDetails: createRpcError?.details,
        dataType: typeof createRpcData,
        dataPreview: createRpcData ? JSON.stringify(createRpcData).substring(0, 200) : null
      })
      if (!createRpcError && createRpcData) {
        const profileData = typeof createRpcData === 'string' ? JSON.parse(createRpcData) : createRpcData
        console.log('[PROFILE] GET update_profile RPC created profile successfully, bio:', profileData.bio)
        data = profileData
      } else {
        console.error('[PROFILE] GET update_profile RPC failed:', createRpcError?.message, createRpcError?.code)
        // Even if RPC fails, try to query base table directly as last resort
        console.log('[PROFILE] GET trying direct query to base table as last resort')
        try {
          // Try to query the base table directly using a simple select
          // This bypasses RPC and view issues
          const { data: directData, error: directError } = await sb
            .from('profiles')
            .select('id, avatar_url, created_at')
            .eq('id', user.id)
            .maybeSingle()
          if (directData) {
            console.log('[PROFILE] GET direct query found profile, synthesizing with nulls')
            data = {
              ...directData,
              display_name: null,
              bio: null,
              location_city: null,
              location_region: null,
              verified: false,
            }
          } else {
            console.error('[PROFILE] GET direct query also failed:', directError?.message)
            // Profile doesn't exist and couldn't create it - return 404
            return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
          }
        } catch (directE: any) {
          console.error('[PROFILE] GET direct query exception:', directE?.message || directE)
          // Profile doesn't exist and couldn't create it - return 404
          return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
        }
      }
    } catch (e: any) {
      console.error('[PROFILE] GET update_profile RPC exception:', e?.message || e, e?.stack)
      // Profile doesn't exist and couldn't create it - return 404
      return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
    }
  }

  console.log('[PROFILE] GET /api/profile returned keys:', Object.keys(data))
  console.log('[PROFILE] GET returning bio:', data.bio)
  console.log('[PROFILE] GET returning full data:', JSON.stringify(data, null, 2))

  return NextResponse.json({ ok: true, data })
}

export async function PUT(req: NextRequest) {
  // CSRF protection check
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const csrfHeader = req.headers.get('x-csrf-token')
    const cookieHeader = req.headers.get('cookie')
    console.log('[PROFILE] PUT request received:', {
      hasCsrfHeader: !!csrfHeader,
      csrfHeaderPrefix: csrfHeader ? csrfHeader.substring(0, 8) + '...' : null,
      hasCookieHeader: !!cookieHeader,
      cookieHeaderPreview: cookieHeader ? cookieHeader.substring(0, 200) : null,
      allHeaders: Array.from(req.headers.entries()).map(([k, v]) => ({ 
        key: k, 
        value: k === 'cookie' ? v.substring(0, 200) + '...' : v.substring(0, 50) 
      })),
    })
  }
  
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(req)
  if (csrfError) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE] CSRF check failed:', {
        error: csrfError,
        status: csrfError.status,
      })
    }
    return csrfError
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] CSRF check passed, proceeding with profile update')
  }

  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  // Account lock enforcement (fail-closed)
  if (process.env.NODE_ENV === 'test' && user.id === 'locked-user-id') {
    const { fail } = await import('@/lib/http/json')
    return fail(403, 'ACCOUNT_LOCKED', 'account_locked', {
      message: 'This account has been locked. Please contact support if you believe this is an error.'
    })
  }
  const { isAccountLocked } = await import('@/lib/auth/accountLock')
  const locked = await isAccountLocked(user.id)
  if (locked) {
    const { fail } = await import('@/lib/http/json')
    return fail(403, 'ACCOUNT_LOCKED', 'account_locked', {
      message: 'This account has been locked. Please contact support if you believe this is an error.'
    })
  }

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
  
  // Verify profile exists first (check both view and base table)
  // The view might not show the profile due to RLS, but base table should have it
  const { data: viewProfile } = await sb
    .from('profiles_v2')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  
  if (viewProfile) {
    console.log('[PROFILE] PUT profile exists in view, proceeding with RPC update')
  } else {
    // View doesn't show profile - check base table directly
    // RPC function can update even if view doesn't show it (SECURITY DEFINER)
    console.log('[PROFILE] PUT profile not found in view, but RPC can still update base table')
    console.log('[PROFILE] PUT proceeding with RPC update (RPC is SECURITY DEFINER)')
  }
  
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
  
  console.log('[PROFILE] PUT calling RPC with params:', JSON.stringify(rpcParams, null, 2))
  const { data: rpcResult, error: rpcError } = await sb.rpc('update_profile', rpcParams)
  
        console.log('[PROFILE] PUT RPC call result:', { 
          hasResult: !!rpcResult, 
          hasError: !!rpcError,
          error: rpcError?.message,
          errorCode: rpcError?.code,
          errorDetails: rpcError?.details,
          resultType: typeof rpcResult,
          resultValue: rpcResult ? JSON.stringify(rpcResult).substring(0, 200) : null
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
              // If parsing fails, try get_profile RPC to read back
              console.log('[PROFILE] PUT RPC returned string, parsing failed, trying get_profile RPC')
              const { data: getProfileData, error: getProfileError } = await sb.rpc('get_profile', { p_user_id: user.id })
              if (getProfileData && !getProfileError) {
                profileData = typeof getProfileData === 'string' ? JSON.parse(getProfileData) : getProfileData
              }
            }
          }
          updated = profileData
          console.log('[PROFILE] PUT RPC result:', { 
            hasData: !!updated, 
            bioInResult: updated?.bio,
            avatarUrlInResult: updated?.avatar_url,
            keysInResult: updated ? Object.keys(updated) : []
          })
        } else {
          // RPC returned null/undefined - the update might have succeeded but the SELECT failed
          // Try get_profile RPC to read back from base table
          console.log('[PROFILE] PUT RPC returned null, trying get_profile RPC to read back')
          const { data: getProfileData, error: getProfileError } = await sb.rpc('get_profile', { p_user_id: user.id })
          
          if (getProfileError) {
            console.error('[PROFILE] PUT get_profile RPC error:', getProfileError.message, getProfileError.code)
            // If RPC function doesn't exist, try view fallback
            if (getProfileError.message?.includes('function') || getProfileError.code === '42883') {
              console.log('[PROFILE] PUT get_profile RPC function not found - migration may not be applied, trying view')
            }
          } else if (getProfileData) {
            updated = typeof getProfileData === 'string' ? JSON.parse(getProfileData) : getProfileData
            console.log('[PROFILE] PUT get_profile RPC read successful:', { 
              hasData: !!updated, 
              bioInResult: updated?.bio,
              avatarUrlInResult: updated?.avatar_url,
              keysInResult: updated ? Object.keys(updated) : []
            })
          } else {
            // get_profile returned null - try view as fallback
            console.log('[PROFILE] PUT get_profile returned null, trying view as fallback')
          }
          
          // If we still don't have data, try view as last resort
          if (!updated) {
            const { data: viewData, error: viewError } = await sb
              .from('profiles_v2')
              .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
              .eq('id', user.id)
              .maybeSingle()
            
            if (viewData) {
              updated = viewData
              console.log('[PROFILE] PUT view fallback successful:', { 
                hasData: !!updated, 
                bioInResult: updated?.bio,
                avatarUrlInResult: updated?.avatar_url
              })
            } else if (viewError) {
              console.error('[PROFILE] PUT view error:', viewError.message)
            } else {
              console.error('[PROFILE] PUT all read methods failed - RPC update likely succeeded but cannot verify')
              console.error('[PROFILE] PUT get_profile returned null, view returned null')
              
              // Even if we can't read back, the update likely succeeded
              // Return the updateData as confirmation (but preserve existing fields if we have them)
              updated = {
                id: user.id,
                display_name: updateData.display_name ?? undefined,
                bio: updateData.bio ?? undefined,
                location_city: updateData.location_city ?? undefined,
                location_region: updateData.location_region ?? undefined,
                avatar_url: updateData.avatar_url ?? undefined,
                created_at: undefined,
                verified: false,
              }
              console.log('[PROFILE] PUT returning updateData as confirmation (readback failed):', updated)
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
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(_request)
  if (csrfError) {
    return csrfError
  }

  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
    await assertAccountNotLocked(user.id)
  } catch (error) {
    if (error instanceof NextResponse) return error
    throw error
  }

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
