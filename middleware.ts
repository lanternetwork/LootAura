import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth/server-session'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // 0. Bypass auth callback route completely to prevent redirect loops
  if (pathname === '/auth/callback') {
    return NextResponse.next()
  }
  
  // 1. Public pages that don't require authentication
  const isPublicPage = 
    pathname === '/' ||
    pathname === '/sales' ||
    pathname === '/sell/new' ||
    pathname === '/admin/tools';
  
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
    pathname === '/api/location' ||
    pathname === '/api/lookup-sale';
  
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
    pathname.startsWith('/account') ||  // Remove trailing slash to match /account
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
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log(`[MIDDLEWARE] checking authentication for → ${pathname}`);
  }
  
  const cookieStore = cookies()
  
  // Validate session with Supabase (skip the fast check for Google OAuth compatibility)
  // Google OAuth sessions may use different cookie names than the fast check expects
  const session = await validateSession(cookieStore)
  if (!session) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MIDDLEWARE] Session validation failed', { event: 'auth-mw', path: pathname, authenticated: false })
    }
    
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // For pages, redirect to signin
    // Prevent redirect loops: don't redirect if we're already going to signin
    if (pathname.startsWith('/auth/signin') || pathname.startsWith('/auth/login')) {
      console.log('[MIDDLEWARE] Already on signin page, allowing access to prevent loop')
      return NextResponse.next()
    }
    
    const loginUrl = new URL('/auth/signin', req.url)
    // Only allow same-origin relative paths for redirectTo
    const redirectTo = req.nextUrl.pathname.startsWith('/') ? req.nextUrl.pathname : '/'
    // Encode redirectTo to handle query parameters properly
    loginUrl.searchParams.set('redirectTo', encodeURIComponent(redirectTo + req.nextUrl.search))
    return NextResponse.redirect(loginUrl)
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[MIDDLEWARE] Session valid', { event: 'auth-mw', path: pathname, authenticated: true })
  }

  // If user is authenticated, auto-upsert profile on first request
  if (session?.user) {
    try {
      // Create a server client for profile operations
      const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
      const supabase = createServerSupabaseClient(cookieStore)
      
      if (supabase && supabase.from) {
        const { data: profile } = await supabase
          .from('profiles_v2')
          .select('home_zip')
          .eq('id', session.user.id)
          .maybeSingle()

        // Best-effort: if la_loc cookie missing and profile has home_zip, set a placeholder
        // Note: We avoid making HTTP requests in middleware to prevent SSRF
        const hasCookie = !!cookieStore.get('la_loc')?.value
        const homeZip = profile?.home_zip as string | undefined
        if (!hasCookie && homeZip) {
          // Set a placeholder cookie that will be resolved on the client side
          const placeholderPayload = JSON.stringify({ 
            zip: homeZip, 
            city: '', 
            state: '', 
            lat: 0, 
            lng: 0,
            placeholder: true 
          })
          cookieStore.set({ 
            name: 'la_loc', 
            value: placeholderPayload, 
            httpOnly: false, 
            maxAge: 60 * 60 * 24, 
            sameSite: 'lax', 
            path: '/' 
          })
        }
      }
    } catch (error) {
      console.error('Error upserting profile:', error)
      // Don't block the request if profile creation fails
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all app routes except static assets, health endpoints, and auth callback
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|apple-touch-icon.png|icon.png|icons/|assets/|static/|public/|api/health/|auth/callback).*)',
    // Match API routes except health endpoints
    '/api/((?!health/).)*'
  ],
}