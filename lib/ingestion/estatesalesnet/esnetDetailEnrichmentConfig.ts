const DEFAULT_CONCURRENCY = 4
const MAX_CONCURRENCY = 16

export function parseEsnetDetailEnrichmentConcurrencyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.ESNET_DETAIL_ENRICH_CONCURRENCY
  if (raw === undefined || raw === '') return DEFAULT_CONCURRENCY
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONCURRENCY
  return Math.min(n, MAX_CONCURRENCY)
}
