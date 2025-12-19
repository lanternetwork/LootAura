import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { assertAccountNotLocked } from '@/lib/auth/accountLock'

export const dynamic = 'force-dynamic'

async function onboardingLocationHandler(request: NextRequest) {
  // CSRF protection
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  // Authentication required
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Account lock check
  try {
    await assertAccountNotLocked(user.id)
  } catch (error) {
    if (error instanceof NextResponse) return error
    throw error
  }

  // Parse request body
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const { location } = body
  if (!location || typeof location !== 'string' || location.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'Location is required' }, { status: 400 })
  }

  const trimmedLocation = location.trim()

  // Try to resolve location: first as ZIP, then as city+state
  let resolvedLocation: {
    zip: string
    city: string
    state: string
    lat: number
    lng: number
  } | null = null

  // 1. Try as ZIP code (5 digits)
  const zipMatch = trimmedLocation.match(/^\d{5}(-\d{4})?$/)
  if (zipMatch) {
    const zip = zipMatch[1] ? zipMatch[0].slice(0, 5) : zipMatch[0]
    try {
      const zipResponse = await fetch(new URL(`/api/geocoding/zip?zip=${encodeURIComponent(zip)}`, request.url), {
        cache: 'no-store',
      })
      if (zipResponse.ok) {
        const zipData = await zipResponse.json()
        if (zipData.ok && zipData.lat && zipData.lng) {
          resolvedLocation = {
            zip: zipData.zip,
            city: zipData.city || '',
            state: zipData.state || '',
            lat: zipData.lat,
            lng: zipData.lng,
          }
        }
      }
    } catch (zipError) {
      // Continue to city lookup
    }
  }

  // 2. If ZIP lookup failed, try as city+state
  if (!resolvedLocation) {
    try {
      const addressResponse = await fetch(
        new URL(`/api/geocoding/address?address=${encodeURIComponent(trimmedLocation)}`, request.url),
        { cache: 'no-store' }
      )
      if (addressResponse.ok) {
        const addressData = await addressResponse.json()
        if (addressData.ok && addressData.data?.lat && addressData.data?.lng) {
          // Extract ZIP from address lookup if available
          let zip = addressData.data.zip || ''
          // If ZIP is in ZIP+4 format, normalize to 5 digits
          if (zip && zip.includes('-')) {
            zip = zip.split('-')[0]
          }
          // Validate ZIP is 5 digits
          if (zip && !/^\d{5}$/.test(zip)) {
            zip = ''
          }
          
          resolvedLocation = {
            zip,
            city: addressData.data.city || '',
            state: addressData.data.state || '',
            lat: addressData.data.lat,
            lng: addressData.data.lng,
          }
        }
      }
    } catch (addressError) {
      // Both lookups failed
    }
  }

  // Validate resolved location
  if (!resolvedLocation) {
    return NextResponse.json(
      { ok: false, error: 'Could not find that location. Please try a ZIP code or city name.' },
      { status: 400 }
    )
  }

  // Validate coordinates are valid (non-zero, in range)
  if (
    !resolvedLocation.lat ||
    !resolvedLocation.lng ||
    resolvedLocation.lat === 0 ||
    resolvedLocation.lng === 0 ||
    resolvedLocation.lat < -90 ||
    resolvedLocation.lat > 90 ||
    resolvedLocation.lng < -180 ||
    resolvedLocation.lng > 180
  ) {
    return NextResponse.json({ ok: false, error: 'Invalid location coordinates' }, { status: 400 })
  }

  // Update profile with home_zip (if we have a ZIP)
  // If ZIP is not available (city-only lookup), we still set the cookie but don't update home_zip
  // The user can still use the app, and the cookie will be used for location
  if (resolvedLocation.zip) {
    try {
      const db = getRlsDb()
      const { error: updateError } = await fromBase(db, 'profiles')
        .update({ home_zip: resolvedLocation.zip })
        .eq('id', user.id)
        .select('id')
        .single()

      if (updateError) {
        console.error('[ONBOARDING] Failed to update profile home_zip:', updateError)
        return NextResponse.json({ ok: false, error: 'Failed to save location' }, { status: 500 })
      }
    } catch (updateError) {
      console.error('[ONBOARDING] Error updating profile:', updateError)
      return NextResponse.json({ ok: false, error: 'Failed to save location' }, { status: 500 })
    }
  } else {
    // City-only lookup: We don't have a ZIP, but we still want to set the cookie
    // The user will need to provide a ZIP later, but for now we allow them to proceed
    // This handles edge cases where city lookup succeeds but doesn't return a ZIP
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[ONBOARDING] City-only lookup: no ZIP available, setting cookie only')
    }
  }

  // Set la_loc cookie with location data
  const locationData = {
    zip: resolvedLocation.zip,
    city: resolvedLocation.city,
    state: resolvedLocation.state,
    lat: resolvedLocation.lat,
    lng: resolvedLocation.lng,
    source: 'onboarding',
  }

  // Determine if HTTPS (for secure cookie flag)
  const protocol = request.nextUrl.protocol
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isHttps = protocol === 'https:' || forwardedProto === 'https' || request.url.startsWith('https://')

  // Create response and set cookie on response object
  const response = NextResponse.json({ ok: true, data: locationData })
  response.cookies.set({
    name: 'la_loc',
    value: JSON.stringify(locationData),
    httpOnly: false, // Must be readable by client
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })

  return response
}

export const POST = onboardingLocationHandler

