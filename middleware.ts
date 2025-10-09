import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // 0. Explicit bypass for manifest.json and other critical assets
  if (pathname === '/manifest.json' || pathname === '/favicon.ico' || pathname === '/sw.js') {
    return NextResponse.next();
  }
  
  // 1. Bypass all static assets immediately - comprehensive list
  const isStaticAsset = 
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/public/') ||
    pathname.match(/\.[a-z0-9]+$/i) || // files with extensions
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/icons/');
  
  if (isStaticAsset) {
    return NextResponse.next();
  }
  
  // 2. Bypass requests with manifest content type or .json extension
  const accept = req.headers.get('accept') || '';
  const isManifestRequest = accept.includes('application/manifest+json') || pathname.endsWith('.json');
  if (isManifestRequest) {
    return NextResponse.next();
  }
  
  // 3. Bypass auth pages to prevent redirect loops
  const isAuthPage = 
    pathname === '/login' ||
    pathname === '/signin' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/');
  
  if (isAuthPage) {
    return NextResponse.next();
  }
  
  // 4. Only protect specific routes and write APIs
  const isProtectedRoute = 
    pathname.startsWith('/favorites/') ||
    pathname.startsWith('/account/') ||
    pathname.startsWith('/admin/');
  
  const isWriteAPI = 
    req.method === 'POST' && pathname.startsWith('/api/sales') ||
    req.method === 'PUT' && pathname.startsWith('/api/sales') ||
    req.method === 'DELETE' && pathname.startsWith('/api/sales');
  
  // Only run auth checks for protected routes or write APIs
  if (!isProtectedRoute && !isWriteAPI) {
    return NextResponse.next();
  }
  
  // 5. Only check auth for HTML navigations or write APIs
  const isHtml = accept.includes('text/html');
  if (!isHtml && !isWriteAPI) {
    return NextResponse.next();
  }
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

  // All routes matched by this middleware require authentication
  if (!user) {
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
    // Only match specific routes that need authentication
    '/favorites/:path*', 
    '/account/:path*',
    '/admin/:path*',
    // Match write APIs (but not GET requests)
    '/api/sales'
  ],
}