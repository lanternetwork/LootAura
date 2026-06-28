/**
 * Apple App Site Association (AASA) payload for LootAura iOS Universal Links.
 * Served at /.well-known/apple-app-site-association when APPLE_TEAM_ID is configured.
 */
export function buildAppleAppSiteAssociation(teamId: string) {
  const normalizedTeamId = teamId.trim()
  if (!normalizedTeamId) {
    throw new Error('APPLE_TEAM_ID is required')
  }

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${normalizedTeamId}.com.lootaura.app`,
          paths: ['/auth/callback*', '/auth/native-callback*'],
        },
      ],
    },
  }
}
