import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'
import { authDebug } from '@/lib/debug/authDebug'

export const dynamic = 'force-dynamic'

/**
 * Idempotent profile creation - ensures a profile exists for the authenticated user
 * This function can be called multiple times safely without creating duplicates
 */
export async function POST(_request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

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
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

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
