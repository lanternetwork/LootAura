import { createServerClient } from '@supabase/ssr'
import { NextResponse, cookies } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // 1. Public pages that don't require authentication
  const isPublicPage = 
    pathname === '/' ||
    pathname === '/sales' ||
    pathname === '/sell/new';
  
  if (isPublicPage) {
    console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    return NextResponse.next();
  }
  
  // 2. Public static assets and PWA files
  const isStaticAsset = 
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/public/') ||
    pathname.match(/\.[a-z0-9]+$/i) || // files with extensions
    pathname === '/manifest.json' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/icons/');
  
  if (isStaticAsset) {
    console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    return NextResponse.next();
  }
  
  // 3. Public API endpoints (GET only for sales, all methods for others)
  const isPublicAPI = 
    (pathname === '/api/sales' && req.method === 'GET') ||
    (pathname === '/api/sales/markers' && req.method === 'GET') ||
    pathname.startsWith('/api/geocoding/') ||
    pathname === '/api/location';
  
  if (isPublicAPI) {
    console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    return NextResponse.next();
  }
  
  // 4. Bypass requests with manifest content type or .json extension
  const accept = req.headers.get('accept') || '';
  const isManifestRequest = accept.includes('application/manifest+json') || pathname.endsWith('.json');
  if (isManifestRequest) {
    console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    return NextResponse.next();
  }
  
  // 5. Bypass auth pages to prevent redirect loops
  const isAuthPage = 
    pathname === '/login' ||
    pathname === '/signin' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/');
  
  if (isAuthPage) {
    console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    return NextResponse.next();
  }
  
  // 6. Protected routes that require authentication
  const isProtectedRoute = 
    pathname.startsWith('/favorites/') ||
    pathname.startsWith('/account/') ||
    pathname.startsWith('/admin/');
  
  // 7. Write APIs that require authentication
  const isWriteAPI = 
    (req.method === 'POST' && pathname.startsWith('/api/sales')) ||
    (req.method === 'PUT' && pathname.startsWith('/api/sales')) ||
    (req.method === 'PATCH' && pathname.startsWith('/api/sales')) ||
    (req.method === 'DELETE' && pathname.startsWith('/api/sales'));
  
  // If it's not a protected route or write API, allow public access
  if (!isProtectedRoute && !isWriteAPI) {
    console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    return NextResponse.next();
  }
  
  // Only run auth checks for protected routes or write APIs
  console.log(`[MIDDLEWARE] checking authentication for → ${pathname}`);
  
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
    const loginUrl = new URL('/auth/signin', req.url)
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
    // Match all app routes except static assets
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|apple-touch-icon.png|icon.png|icons/|assets/|static/|public/).*)',
    // Match API routes
    '/api/:path*'
  ],
}