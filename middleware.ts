import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { hasValidSession, validateSession } from '@/lib/auth/server-session'

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
  
  // Fast session check for middleware
  if (!hasValidSession(cookieStore)) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MIDDLEWARE] No valid session found', { event: 'auth-mw', path: pathname, authenticated: false })
    }
    
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // For pages, redirect to signin
    const loginUrl = new URL('/auth/signin', req.url)
    // Only allow same-origin relative paths for redirectTo
    const redirectTo = req.nextUrl.pathname.startsWith('/') ? req.nextUrl.pathname : '/'
    loginUrl.searchParams.set('redirectTo', redirectTo)
    return NextResponse.redirect(loginUrl)
  }

  // Validate session with Supabase
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
    const loginUrl = new URL('/auth/signin', req.url)
    // Only allow same-origin relative paths for redirectTo
    const redirectTo = req.nextUrl.pathname.startsWith('/') ? req.nextUrl.pathname : '/'
    loginUrl.searchParams.set('redirectTo', redirectTo)
    return NextResponse.redirect(loginUrl)
  }

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[MIDDLEWARE] Session valid', { event: 'auth-mw', path: pathname, authenticated: true })
  }

  // Note: Profile operations removed from middleware to avoid Edge Runtime issues
  // Profile creation will be handled in the app components instead

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all app routes except static assets and health endpoints
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|apple-touch-icon.png|icon.png|icons/|assets/|static/|public/|api/health/).*)',
    // Match API routes except health endpoints
    '/api/((?!health/).)*'
  ],
}