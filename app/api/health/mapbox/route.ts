import { NextResponse } from 'next/server'

export async function GET() {
  const t = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''
  const tokenPresent = !!t
  const tokenPrefix = tokenPresent ? (t.startsWith('pk.') ? 'pk' : (t.startsWith('sk.') ? 'sk' : 'none')) : 'none'
  return NextResponse.json({
    ok: true,
    tokenPresent,
    tokenPrefix,
    domainHint: process.env.NEXT_PUBLIC_SITE_URL || null,
  })
}


