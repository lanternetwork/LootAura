import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const cookieStore = cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => {
          cookieStore.set({ name, value, ...options })
        },
        remove: (name, options) => {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes that require authentication
  const protectedRoutes = ['/sell', '/favorites', '/account']
  const isProtectedRoute = protectedRoutes.some(route => 
    req.nextUrl.pathname.startsWith(route)
  )

  // If accessing a protected route without authentication
  if (isProtectedRoute && !user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirectTo', req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // If user is authenticated, auto-upsert profile on first request
  if (user) {
    try {
      const { data: profile } = await supabase
        .from('profiles_v2')
        .select('home_zip')
        .eq('id', user.id)
        .maybeSingle()

      // Best-effort: if la_loc cookie missing and profile has home_zip, resolve coordinates and set la_loc
      const hasCookie = !!cookieStore.get('la_loc')?.value
      const homeZip = profile?.home_zip as string | undefined
      if (!hasCookie && homeZip) {
        try {
          const url = new URL(req.url)
          const geoUrl = `${url.origin}/api/geocoding/zip?zip=${encodeURIComponent(homeZip)}`
          const r = await fetch(geoUrl, { cache: 'no-store' })
          if (r.ok) {
            const z = await r.json()
            if (z?.ok && z.lat && z.lng) {
              const payload = JSON.stringify({ lat: z.lat, lng: z.lng, zip: z.zip, city: z.city, state: z.state })
              cookieStore.set({ name: 'la_loc', value: payload, httpOnly: false, maxAge: 60 * 60 * 24, sameSite: 'lax', path: '/' })
            }
          }
        } catch {}
      }
    } catch (error) {
      console.error('Error upserting profile:', error)
      // Don't block the request if profile creation fails
    }
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}