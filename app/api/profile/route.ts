import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import { isAllowedAvatarUrl } from '@/lib/cloudinary'

export async function GET() {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] fetch profile for uid')
  }

  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? { id: user.id } })
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
    .select('*')
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

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { authDebug } from '@/lib/debug/authDebug'

export const dynamic = 'force-dynamic'

/**
 * Idempotent profile creation - ensures a profile exists for the authenticated user
 * This function can be called multiple times safely without creating duplicates
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    authDebug.logAuthFlow('profile-creation', 'start', 'start', { 
      userId: user.id, 
      email: user.email 
    })

    // Check if profile already exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles_v2')
      .select('id, display_name, avatar_url, home_zip, preferences')
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError) {
      console.error('[PROFILE] Error fetching existing profile:', fetchError)
      return NextResponse.json({ error: 'Failed to check existing profile' }, { status: 500 })
    }

    // If profile exists, return it
    if (existingProfile) {
      authDebug.logAuthFlow('profile-creation', 'exists', 'success', { 
        userId: user.id 
      })
      
      return NextResponse.json({ 
        profile: existingProfile,
        created: false,
        message: 'Profile already exists'
      })
    }

    // Create new profile with default values
    const defaultProfile = {
      id: user.id,
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      avatar_url: user.user_metadata?.avatar_url || null,
      home_zip: null,
      preferences: {
        notifications: {
          email: true,
          push: false
        },
        privacy: {
          show_email: false,
          show_phone: false
        }
      }
    }

    const { data: newProfile, error: createError } = await supabase
      .from('profiles_v2')
      .insert(defaultProfile)
      .select('id, display_name, avatar_url, home_zip, preferences')
      .single()

    if (createError) {
      console.error('[PROFILE] Error creating profile:', createError)
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
    }

    authDebug.logAuthFlow('profile-creation', 'created', 'success', { 
      userId: user.id,
      profileId: newProfile.id
    })

    return NextResponse.json({ 
      profile: newProfile,
      created: true,
      message: 'Profile created successfully'
    })

  } catch (error) {
    console.error('[PROFILE] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Get current user's profile
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch profile
    const { data: profile, error: fetchError } = await supabase
      .from('profiles_v2')
      .select('id, display_name, avatar_url, home_zip, preferences')
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError) {
      console.error('[PROFILE] Error fetching profile:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({ profile })

  } catch (error) {
    console.error('[PROFILE] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
