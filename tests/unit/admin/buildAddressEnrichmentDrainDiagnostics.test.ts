import { describe, expect, it } from 'vitest'
import { buildAddressEnrichmentDrainDiagnostics } from '@/lib/admin/buildAddressEnrichmentDrainDiagnostics'
import type { AddressEnrichmentDrainCohortAnalysis } from '@/lib/ingestion/address/addressEnrichmentDrainTypes'

describe('buildAddressEnrichmentDrainDiagnostics', () => {
  it('renders workstream sections', () => {
    const analysis: AddressEnrichmentDrainCohortAnalysis = {
      cohortKey: 'address_enrichment_pending_x_provider_native',
      total: 10,
      scanned: 10,
      byClassification: {
        waiting: 2,
        eligible_now: 1,
        stalled: 6,
        exhausted: 1,
        unclassified: 0,
      },
      byFailureSubtype: {
        parse_no_address: 6,
        still_gated: 2,
        not_found: 0,
        fetch_failure: 0,
        blocked_html: 0,
        captcha: 0,
        claim_ineligible: 1,
        never_attempted: 1,
        max_attempts_exceeded: 0,
        other: 0,
      },
      dominantFailureSubtype: 'parse_no_address',
    }

    const md = buildAddressEnrichmentDrainDiagnostics(analysis)
    expect(md).toContain('ADDRESS_ENRICHMENT_DRAIN_REPAIR')
    expect(md).toContain('Workstream A — Cohort classification')
    expect(md).toContain('Workstream B — Failure subtypes')
    expect(md).toContain('parse_no_address')
  })
})
