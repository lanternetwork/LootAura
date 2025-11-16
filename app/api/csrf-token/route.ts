import { NextRequest, NextResponse } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'

/**
 * API route to initialize CSRF token cookie
 * This is a fallback in case middleware doesn't set it properly
 */
export async function GET(request: NextRequest) {
  // Generate a new CSRF token
  const token = generateCsrfToken()
  
  // Detect if request is over HTTPS
  const protocol = request.nextUrl.protocol
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isHttps = protocol === 'https:' || 
                 forwardedProto === 'https' ||
                 request.url.startsWith('https://') ||
                 process.env.NODE_ENV === 'production'
  
  // Create response with CSRF token cookie
  const response = NextResponse.json({ success: true })
  response.cookies.set('csrf-token', token, {
    httpOnly: false, // Must be readable by client to send in header
    secure: isHttps, // Set secure flag based on actual HTTPS connection
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/'
  })
  
  return response
}

