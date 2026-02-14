import { NextResponse } from 'next/server'
import manifest from '@/../public/manifest.json'

/**
 * Serve manifest.json with proper Content-Type header
 * This ensures the manifest is served as application/manifest+json
 * Some browsers require this MIME type for PWA installation
 */
export async function GET() {
  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
