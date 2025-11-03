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

// Legacy handlers removed to avoid duplicate exports and name collisions
