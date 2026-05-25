/**
 * Phase B: shadow cross-provider convergence (no ingest/publish enforcement).
 * Opt-in via `INGESTION_CROSS_PROVIDER_SHADOW=true`.
 */
export function isCrossProviderShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.INGESTION_CROSS_PROVIDER_SHADOW === 'true'
}
