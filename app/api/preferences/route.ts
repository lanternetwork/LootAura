import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PreferencesSchema } from '@/lib/validators/preferences'

const DEFAULTS = { theme: 'system', email_opt_in: false, units: 'imperial', discovery_radius_km: 10 }

export async function GET() {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await sb
    .from('user_preferences')
    .select('theme,email_opt_in,units,discovery_radius_km,updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? { user_id: user.id, ...DEFAULTS } })
}

export async function PUT(req: Request) {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const json = await req.json()
  const parsed = PreferencesSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid preferences', details: parsed.error.issues }, { status: 400 })
  }

  const payload = { user_id: user.id, ...parsed.data }
  const { data, error } = await sb
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('theme,email_opt_in,units,discovery_radius_km,updated_at')
    .maybeSingle()

  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ ok: false, error: error.message }, { status })
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PREFERENCES] upsert success')
  }

  return NextResponse.json({ ok: true, data })
}


