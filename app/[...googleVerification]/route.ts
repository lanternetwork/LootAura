import { NextRequest, NextResponse } from 'next/server'
import { ENV_PUBLIC } from '@/lib/env'

/**
 * Google Site Verification HTML File Route
 * 
 * This route serves Google site verification HTML files.
 * Google will request files like: /google1234567890.html
 * 
 * To use this method:
 * 1. Get the verification filename from Google (e.g., "google1234567890.html")
 * 2. Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_FILE environment variable to the filename (e.g., "google1234567890.html")
 * 3. Google will request /google1234567890.html and this route will serve it
 * 
 * The file should contain just the verification code as plain text.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { googleVerification: string[] } }
) {
  const path = params.googleVerification.join('/')
  const verificationFile = ENV_PUBLIC.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_FILE
  
  // Only handle Google verification files (must start with "google" and end with ".html")
  if (!path.match(/^google.+\.html$/)) {
    return new NextResponse('Not Found', { status: 404 })
  }
  
  // If verification file is configured, only serve that specific file
  if (verificationFile && path !== verificationFile) {
    return new NextResponse('Not Found', { status: 404 })
  }
  
  // Extract the verification code from the filename
  // Format: google{CODE}.html
  // The file content should be: google-site-verification: google{CODE}.html
  const htmlContent = `google-site-verification: ${path}`
  
  return new NextResponse(htmlContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}

