import { NextResponse } from 'next/server'

export async function GET() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''
  const tokenPresent = !!mapboxToken
  const tokenPrefix = tokenPresent
    ? (mapboxToken.startsWith('pk.') ? 'pk' : (mapboxToken.startsWith('sk.') ? 'sk' : 'none'))
    : 'none'
  if (!tokenPresent) {
    return NextResponse.json({
      ok: false,
      tokenPresent: false,
      canonicalVar: 'NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN',
      error: 'Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN',
      domainHint: process.env.NEXT_PUBLIC_SITE_URL || null,
    }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    tokenPresent,
    canonicalVar: 'NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN',
    tokenPrefix,
    domainHint: process.env.NEXT_PUBLIC_SITE_URL || null,
  })
}


