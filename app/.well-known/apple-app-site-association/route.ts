import { NextResponse } from 'next/server'

import { buildAppleAppSiteAssociation } from '@/lib/mobile/appleAppSiteAssociation'

/**
 * Production Universal Links configuration for the LootAura iOS app.
 * Requires APPLE_TEAM_ID in the deployment environment.
 */
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim()
  if (!teamId) {
    return NextResponse.json(
      { error: 'APPLE_TEAM_ID is not configured for Universal Links' },
      { status: 503 }
    )
  }

  return NextResponse.json(buildAppleAppSiteAssociation(teamId), {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
