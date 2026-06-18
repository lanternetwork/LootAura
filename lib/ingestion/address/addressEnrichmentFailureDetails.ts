export const INGESTED_ADDRESS_ENRICHMENT_DETAILS_SCHEMA_VERSION = 1 as const

export function mergeAddressEnrichmentDetails(
  existing: unknown,
  patch: Record<string, unknown> & { recordTerminalEntry?: boolean }
): Record<string, unknown> {
  const { recordTerminalEntry, ...rest } = patch
  const prior =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  const priorSection =
    prior.address_enrichment &&
    typeof prior.address_enrichment === 'object' &&
    !Array.isArray(prior.address_enrichment)
      ? (prior.address_enrichment as Record<string, unknown>)
      : null
  const terminalEnteredAt =
    recordTerminalEntry && typeof priorSection?.terminalEnteredAt !== 'string'
      ? new Date().toISOString()
      : typeof priorSection?.terminalEnteredAt === 'string'
        ? priorSection.terminalEnteredAt
        : undefined

  prior.address_enrichment = {
    schema_version: INGESTED_ADDRESS_ENRICHMENT_DETAILS_SCHEMA_VERSION,
    recorded_at: new Date().toISOString(),
    ...(terminalEnteredAt ? { terminalEnteredAt } : {}),
    ...rest,
  }
  return prior
}
