import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Serve manifest.webmanifest with proper Content-Type header.
 * Static file lives in public/; this route guarantees application/manifest+json.
 */
export async function GET() {
  try {
    const manifestPath = join(process.cwd(), 'public', 'manifest.webmanifest')
    const manifestContent = readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestContent)
    
    return NextResponse.json(manifest, {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Manifest not found' },
      { status: 404 }
    )
  }
}
