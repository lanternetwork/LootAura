import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth/server-session'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const userAgent = req.headers.get('user-agent') || '';
  
  // 0. Maintenance mode check (must be first, before any other logic)
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  
  if (isMaintenanceMode) {
    // Allow maintenance page itself to avoid infinite rewrites
    if (pathname === '/maintenance') {
      return NextResponse.next();
    }
    
    // Allow admin pages (admin gating happens in the page itself)
    if (pathname.startsWith('/admin')) {
      return NextResponse.next();
    }
    
    // Allow all API routes to stay online
    if (pathname.startsWith('/api')) {
      return NextResponse.next();
    }
    
    // Allow static assets
    if (
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/assets/') ||
      pathname.startsWith('/images/') ||
      pathname.startsWith('/icons/') ||
      pathname === '/manifest.json' ||
      pathname === '/manifest.webmanifest' ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml' ||
      pathname === '/ads.txt' ||
      pathname === '/sw.js' ||
      pathname.startsWith('/icon') ||
      pathname.startsWith('/.well-known/')
    ) {
      return NextResponse.next();
    }
    
    // Rewrite all other requests to maintenance page
    const maintenanceUrl = new URL('/maintenance', req.url);
    return NextResponse.rewrite(maintenanceUrl);
  }
  
  // 0. Immediately bypass static PWA files and manifest (before any other checks)
  if (
    pathname === '/manifest.json' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/ads.txt' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/.well-known/') ||
    (pathname.endsWith('.json') && pathname.startsWith('/'))
  ) {
    return NextResponse.next()
  }
  
  // 0.1. Bypass auth callback route completely to prevent redirect loops
  if (pathname === '/auth/callback') {
    return NextResponse.next()
  }
  
  // 0.2. Allow social media crawlers (Facebook, Twitter, LinkedIn, etc.) to access all pages
  // This is critical for Open Graph and Twitter Card metadata to work
  const isSocialMediaCrawler = 
    userAgent.includes('facebookexternalhit') ||
    userAgent.includes('Facebot') ||
    userAgent.includes('Twitterbot') ||
    userAgent.includes('LinkedInBot') ||
    userAgent.includes('WhatsApp') ||
    userAgent.includes('Slackbot') ||
    userAgent.includes('Applebot') ||
    userAgent.includes('Googlebot') ||
    userAgent.includes('Bingbot') ||
    userAgent.includes('Slurp') ||
    userAgent.includes('DuckDuckBot') ||
    userAgent.includes('Baiduspider') ||
    userAgent.includes('YandexBot') ||
    userAgent.includes('Sogou') ||
    userAgent.includes('Exabot') ||
    userAgent.includes('ia_archiver');
  
  if (isSocialMediaCrawler) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[MIDDLEWARE] allowing social media crawler access → ${pathname} (${userAgent.substring(0, 50)})`);
    }
    return NextResponse.next();
  }
  
  // Initialize CSRF token early for ALL requests (before any early returns)
  // This ensures the cookie is available for client-side JavaScript on all pages
  const cookieStore = cookies()
  let csrfToken: string | null = null
  try {
    const { generateCsrfToken, getCsrfToken } = await import('@/lib/csrf')
    const existingToken = getCsrfToken()
    if (!existingToken) {
      csrfToken = generateCsrfToken()
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[MIDDLEWARE] CSRF token initialized:', { tokenLength: csrfToken.length })
      }
    } else {
      csrfToken = existingToken
    }
  } catch (error) {
    // CSRF token initialization is best-effort, but generate a token if we can
    // This ensures we always have a token to set, even if reading fails
    try {
      const { generateCsrfToken } = await import('@/lib/csrf')
      csrfToken = generateCsrfToken()
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[MIDDLEWARE] Failed to read CSRF token, generated new one:', error)
      }
    } catch (genError) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[MIDDLEWARE] Failed to generate CSRF token:', genError)
      }
    }
  }
  
  // Helper function to create response with CSRF token
  const createResponseWithCsrf = (response: NextResponse): NextResponse => {
    // Note: csrfToken should already be set above, but if not, we'll handle it
    // We can't use await here since this is a synchronous function
    
    if (csrfToken && response.cookies) {
      // Detect if request is over HTTPS (for Vercel preview deployments)
      // Vercel previews are HTTPS but NODE_ENV might not be 'production'
      // Check multiple sources to reliably detect HTTPS
      const protocol = req.nextUrl.protocol
      const forwardedProto = req.headers.get('x-forwarded-proto')
      const isHttps = protocol === 'https:' || 
                     forwardedProto === 'https' ||
                     req.url.startsWith('https://') ||
                     process.env.NODE_ENV === 'production'
      
      // Always set the cookie on every response to ensure it's available
      // This refreshes the cookie expiration and ensures it's sent to the client
      response.cookies.set('csrf-token', csrfToken, {
        httpOnly: false, // Must be readable by client to send in header
        secure: isHttps, // Set secure flag based on actual HTTPS connection
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/'
        // Don't set domain - let it default to current domain
      })
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[MIDDLEWARE] CSRF token cookie set on response:', {
          hasToken: !!csrfToken,
          tokenLength: csrfToken?.length,
          isHttps,
          protocol,
          forwardedProto,
          url: req.url.substring(0, 50),
          pathname: req.nextUrl.pathname
        })
      }
    } else {
      // Log when cookie is NOT being set to help debug (skip in test environment)
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined
      if (!isTestEnv && process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[MIDDLEWARE] CSRF token cookie NOT set:', {
          hasToken: !!csrfToken,
          hasCookies: !!response.cookies,
          pathname: req.nextUrl.pathname
        })
      }
    }
    return response
  }
  
  // 1. Public pages that don't require authentication
  const isPublicPage = 
    pathname === '/' ||
    pathname === '/sales' ||
    pathname.startsWith('/sales/') || // Sale detail pages are public
    pathname === '/sell/new' ||
    pathname === '/admin/tools';
  
  if (isPublicPage) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    }
    const response = NextResponse.next()
    return createResponseWithCsrf(response)
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
    pathname === '/ads.txt' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/icons/');
  
  if (isStaticAsset) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    }
    const response = NextResponse.next()
    return createResponseWithCsrf(response)
  }
  
  // 3. Public API endpoints (GET only for sales, all methods for others)
  const isPublicAPI = 
    (pathname === '/api/sales' && req.method === 'GET') ||
    (pathname === '/api/sales/markers' && req.method === 'GET') ||
    pathname.startsWith('/api/geocoding/') ||
    pathname === '/api/location' ||
    pathname === '/api/lookup-sale';
  
  if (isPublicAPI) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    }
    const response = NextResponse.next()
    return createResponseWithCsrf(response)
  }
  
  // 4. Bypass requests with manifest content type or .json extension
  const accept = req.headers.get('accept') || '';
  const isManifestRequest = accept.includes('application/manifest+json') || pathname.endsWith('.json');
  if (isManifestRequest) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    }
    const response = NextResponse.next()
    return createResponseWithCsrf(response)
  }
  
  // 5. Bypass auth pages to prevent redirect loops
  const isAuthPage = 
    pathname === '/login' ||
    pathname === '/signin' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/');
  
  if (isAuthPage) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    }
    const response = NextResponse.next()
    return createResponseWithCsrf(response)
  }
  
  // 6. Protected routes that require authentication
  const isProtectedRoute = 
    pathname === '/favorites' ||
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
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[MIDDLEWARE] allowing public access → ${pathname}`);
    }
    const response = NextResponse.next()
    return createResponseWithCsrf(response)
  }
  
  // Only run auth checks for protected routes or write APIs
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log(`[MIDDLEWARE] checking authentication for → ${pathname}`);
  }
  
  // Get the response object early so we can ensure cookies are set
  const response = NextResponse.next()
  
  // Explicitly set CSRF token cookie in response to ensure it's sent to the client
  // This ensures the cookie is available for client-side JavaScript to read
  // Fixed: Cookie must be set on response object, not just via cookies().set()
  const responseWithCsrf = createResponseWithCsrf(response)
  
  // Validate session with Supabase (skip the fast check for Google OAuth compatibility)
  // Google OAuth sessions may use different cookie names than the fast check expects
  const session = await validateSession(cookieStore)
  if (!session) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[MIDDLEWARE] Session validation failed', { event: 'auth-mw', path: pathname, authenticated: false })
    }
    
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      const apiResponse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return createResponseWithCsrf(apiResponse)
    }
    
    // For pages, redirect to signin
    // Prevent redirect loops: don't redirect if we're already going to signin
    if (pathname.startsWith('/auth/signin') || pathname.startsWith('/auth/login')) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[MIDDLEWARE] Already on signin page, allowing access to prevent loop')
      }
      return responseWithCsrf
    }
    
    const loginUrl = new URL('/auth/signin', req.url)
    // Only allow same-origin relative paths for redirectTo
    const redirectTo = req.nextUrl.pathname.startsWith('/') ? req.nextUrl.pathname : '/'
    // Encode redirectTo to handle query parameters properly
    loginUrl.searchParams.set('redirectTo', encodeURIComponent(redirectTo + req.nextUrl.search))
    const redirectResponse = NextResponse.redirect(loginUrl)
    return createResponseWithCsrf(redirectResponse)
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('Error upserting profile:', error)
      }
      // Don't block the request if profile creation fails
    }
  }

  return responseWithCsrf
}

export const config = {
  matcher: [
    // Match all app routes except static assets, health endpoints, and auth callback
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|ads.txt|apple-touch-icon.png|icon.png|icons/|assets/|static/|public/|api/health/|auth/callback).*)',
    // Match API routes except health endpoints
    '/api/((?!health/).)*'
  ],
}