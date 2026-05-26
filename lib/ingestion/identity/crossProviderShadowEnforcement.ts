/**
 * Phase B–E cross-provider convergence feature flags.
 *
 * Phase E: shadow, ingest, and publish enforcement default **on** unless explicitly disabled.
 * Master kill switch: `INGESTION_CROSS_PROVIDER_ENFORCEMENT=false`.
 * Per-feature opt-out: `INGESTION_CROSS_PROVIDER_SHADOW=false`, etc.
 */

function isMasterKillSwitch(env: NodeJS.ProcessEnv): boolean {
  return env.INGESTION_CROSS_PROVIDER_ENFORCEMENT === 'false'
}

function isExplicitlyDisabled(env: NodeJS.ProcessEnv, key: string): boolean {
  return env[key] === 'false'
}

function isFeatureEnabled(env: NodeJS.ProcessEnv, featureKey: string): boolean {
  if (isMasterKillSwitch(env)) return false
  if (isExplicitlyDisabled(env, featureKey)) return false
  if (env[featureKey] === 'true') return true
  return true
}

/**
 * Phase B: shadow cross-provider convergence (no ingest/publish enforcement when ingest/publish off).
 * Phase E: enabled by default; opt out with `INGESTION_CROSS_PROVIDER_SHADOW=false`.
 */
export function isCrossProviderShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isFeatureEnabled(env, 'INGESTION_CROSS_PROVIDER_SHADOW')
}

/**
 * Phase C: retain cross-provider observations as duplicate rows (no hard skip).
 * Phase E: enabled by default; opt out with `INGESTION_CROSS_PROVIDER_INGEST_ENFORCE=false`.
 */
export function isCrossProviderIngestEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isFeatureEnabled(env, 'INGESTION_CROSS_PROVIDER_INGEST_ENFORCE')
}

/**
 * Phase D: link publish to an existing cross-provider sale instead of creating a second pin.
 * Phase E: enabled by default; opt out with `INGESTION_CROSS_PROVIDER_PUBLISH_LINK=false`.
 */
export function isCrossProviderPublishLinkEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isMasterKillSwitch(env)) return false
  if (isExplicitlyDisabled(env, 'INGESTION_CROSS_PROVIDER_PUBLISH_LINK')) return false
  if (isExplicitlyDisabled(env, 'INGESTION_CROSS_PROVIDER_PUBLISH_ENFORCE')) return false
  if (
    env.INGESTION_CROSS_PROVIDER_PUBLISH_LINK === 'true' ||
    env.INGESTION_CROSS_PROVIDER_PUBLISH_ENFORCE === 'true'
  ) {
    return true
  }
  return true
}
