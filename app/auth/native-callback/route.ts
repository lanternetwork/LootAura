import { NextResponse } from 'next/server'

/**
 * Web fallback route for /auth/native-callback
 * 
 * This route handles cases where Android App Links doesn't open the app
 * (e.g., on web browsers, or if App Links verification fails).
 * It redirects to the standard /auth/callback handler, preserving all
 * query parameters and hash fragments for OAuth completion.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  
  // Build redirect URL to /auth/callback with all query params preserved
  const redirectUrl = new URL('/auth/callback', url.origin)
  
  // Copy all query parameters from the incoming request
  url.searchParams.forEach((value, key) => {
    redirectUrl.searchParams.set(key, value)
  })
  
  // Preserve hash fragment if present (though URL.hash is not available server-side,
  // this is handled client-side if needed)
  
  // Use 307 (Temporary Redirect) to preserve the request method and body
  // This ensures OAuth query params (code, state, etc.) are passed through
  return NextResponse.redirect(redirectUrl.toString(), { status: 307 })
}
