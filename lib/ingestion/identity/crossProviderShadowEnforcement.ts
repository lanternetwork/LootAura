/**
 * Phase B: shadow cross-provider convergence (no ingest/publish enforcement).
 * Opt-in via `INGESTION_CROSS_PROVIDER_SHADOW=true`.
 */
export function isCrossProviderShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.INGESTION_CROSS_PROVIDER_SHADOW === 'true'
}

/**
 * Phase C: retain cross-provider observations as duplicate rows (no hard skip).
 * Opt-in via `INGESTION_CROSS_PROVIDER_INGEST_ENFORCE=true`.
 */
export function isCrossProviderIngestEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.INGESTION_CROSS_PROVIDER_INGEST_ENFORCE === 'true'
}
