import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type SettingsPayload = {
  email_opt_in?: boolean
  default_radius_km?: number
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('seller_settings')
    .select('user_id, email_opt_in, default_radius_km, updated_at, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[SELLER_SETTINGS] Error fetching settings:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      userId: user.id
    })
    return NextResponse.json({ ok: false, code: 'FETCH_ERROR', error: 'Failed to fetch settings' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: data ?? { user_id: user.id, email_opt_in: false, default_radius_km: 10 } })
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as SettingsPayload

  if (typeof body.default_radius_km !== 'undefined') {
    const v = Number(body.default_radius_km)
    if (!Number.isFinite(v) || v < 1 || v > 50) {
      return NextResponse.json({ ok: false, error: 'default_radius_km must be between 1 and 50' }, { status: 400 })
    }
  }

  const payload = {
    user_id: user.id,
    email_opt_in: Boolean(body.email_opt_in ?? false),
    default_radius_km: typeof body.default_radius_km === 'number' ? body.default_radius_km : 10,
  }

  const { data, error } = await supabase
    .from('seller_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, email_opt_in, default_radius_km, updated_at, created_at')
    .maybeSingle()

  if (error) {
    // RLS should block cross-user access; surface as forbidden
    const status = error.code === '42501' ? 403 : 500
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[RLS] blocked mutation', { code: error.code, message: error.message })
    }
    return NextResponse.json({ ok: false, code: 'UPDATE_FAILED', error: 'Failed to update settings' }, { status })
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[DASHBOARD] settings: upsert success')
  }

  return NextResponse.json({ ok: true, data })
}


