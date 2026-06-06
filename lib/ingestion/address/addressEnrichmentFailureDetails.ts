export const INGESTED_ADDRESS_ENRICHMENT_DETAILS_SCHEMA_VERSION = 1 as const

export function mergeAddressEnrichmentDetails(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const prior =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  prior.address_enrichment = {
    schema_version: INGESTED_ADDRESS_ENRICHMENT_DETAILS_SCHEMA_VERSION,
    recorded_at: new Date().toISOString(),
    ...patch,
  }
  return prior
}
