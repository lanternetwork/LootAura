import { NextResponse, NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileUpdateSchema } from '@/lib/validators/profile'
import { isAllowedAvatarUrl } from '@/lib/cloudinary'

export async function GET(_req?: NextRequest) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PROFILE] fetch profile for uid')
  }

  const { data, error } = await sb
    .from('profiles_v2')
    .select('id, display_name, avatar_url, home_zip, preferences')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  return NextResponse.json({ profile: data })
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

// Legacy handlers removed to avoid duplicate exports and name collisions
export async function POST(_request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check existing
  const { data: existing, error: fetchError } = await supabase
    .from('profiles_v2')
    .select('id, display_name, avatar_url, home_zip, preferences')
    .eq('id', user.id)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ error: 'Failed to check existing profile' }, { status: 500 })
  if (existing) {
    return NextResponse.json({ profile: existing, created: false, message: 'Profile already exists' })
  }

  const defaultProfile = {
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
    avatar_url: user.user_metadata?.avatar_url || null,
    home_zip: null,
    preferences: { notifications: { email: true, push: false }, privacy: { show_email: false, show_phone: false } },
  }
  const { data: inserted, error: createError } = await supabase
    .from('profiles_v2')
    .insert(defaultProfile)
    .select('id, display_name, avatar_url, home_zip, preferences')
    .single()
  if (createError) return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  return NextResponse.json({ profile: inserted, created: true, message: 'Profile created successfully' })
}
