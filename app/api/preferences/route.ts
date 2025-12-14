import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PreferencesSchema } from '@/lib/validators/preferences'

const DEFAULTS = { theme: 'system', email_opt_in: false, units: 'imperial', discovery_radius_km: 10 }

export async function GET() {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  // Note: GET requests are read-only and should NOT be blocked by account locks
  // Only write operations (POST, PUT, DELETE) should enforce account locks

  // Try to get preferences from user_preferences table
  // If table doesn't exist or query fails, return defaults
  const { data, error } = await sb
    .from('user_preferences')
    .select('theme,email_opt_in,units,discovery_radius_km,updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    // If error is about table not existing or schema issues, return defaults
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[PREFERENCES] GET error, returning defaults:', error.message)
    }
    // Check if profile has preferences stored there
    const { data: profileData } = await sb
      .from('profiles_v2')
      .select('preferences')
      .eq('id', user.id)
      .maybeSingle()
    
    const prefs = profileData?.preferences || {}
    return NextResponse.json({ ok: true, data: { user_id: user.id, ...DEFAULTS, ...prefs } })
  }
  
  return NextResponse.json({ ok: true, data: data ?? { user_id: user.id, ...DEFAULTS } })
}

async function putPreferencesHandler(req: Request) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(req as any)
  if (csrfError) {
    return csrfError
  }

  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const json = await req.json()
  const parsed = PreferencesSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid preferences', details: parsed.error.issues }, { status: 400 })
  }

  const payload = { user_id: user.id, ...parsed.data }
  
  // Try to upsert to user_preferences table first
  const { data, error } = await sb
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('theme,email_opt_in,units,discovery_radius_km,updated_at')
    .maybeSingle()

  if (error) {
    // If user_preferences table doesn't exist or has schema issues, fallback to profile.preferences
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[PREFERENCES] PUT user_preferences failed, falling back to profile.preferences:', error.message)
    }
    
    // Fallback: Store preferences in profile.preferences JSONB column
    const { data: profileData, error: profileError } = await sb
      .from('profiles')
      .update({ 
        preferences: {
          ...parsed.data,
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('preferences')
      .maybeSingle()
    
    if (profileError) {
      const status = profileError.code === '42501' ? 403 : 500
      return NextResponse.json({ ok: false, error: profileError.message }, { status })
    }
    
    // Return preferences in the same format as user_preferences table
    const prefs = profileData?.preferences || parsed.data
    const response = {
      theme: prefs.theme || parsed.data.theme || DEFAULTS.theme,
      email_opt_in: prefs.email_opt_in ?? parsed.data.email_opt_in ?? DEFAULTS.email_opt_in,
      units: prefs.units || parsed.data.units || DEFAULTS.units,
      discovery_radius_km: prefs.discovery_radius_km ?? parsed.data.discovery_radius_km ?? DEFAULTS.discovery_radius_km,
      updated_at: new Date().toISOString(),
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PREFERENCES] PUT fallback to profile.preferences success')
    }
    
    return NextResponse.json({ ok: true, data: response })
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[PREFERENCES] PUT upsert success')
  }

  return NextResponse.json({ ok: true, data })
}

export async function PUT(req: Request) {
  // Get user ID for rate limiting
  const sb = createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  const userId = user?.id

  const { withRateLimit } = await import('@/lib/rateLimit/withRateLimit')
  const { Policies } = await import('@/lib/rateLimit/policies')

  return withRateLimit(
    putPreferencesHandler,
    [Policies.MUTATE_MINUTE, Policies.MUTATE_DAILY],
    { userId }
  )(req as any)
}


