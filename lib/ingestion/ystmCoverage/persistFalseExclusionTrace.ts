import type { FalseExclusionUrlTrace } from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PERSIST_CHUNK = 100

/**
 * Persists Phase 1 trace results on coverage observations (replay queue).
 */
export async function persistFalseExclusionTraces(
  admin: ReturnType<typeof getAdminDb>,
  traces: FalseExclusionUrlTrace[]
): Promise<void> {
  if (traces.length === 0) return

  for (let i = 0; i < traces.length; i += PERSIST_CHUNK) {
    const slice = traces.slice(i, i + PERSIST_CHUNK)
    for (const trace of slice) {
      const { error } = await fromBase(admin, 'ystm_coverage_observations')
        .update({
          false_exclusion_primary_bucket: trace.primaryBucket,
          false_exclusion_secondary_tags: trace.secondaryTags,
          false_exclusion_summary: trace.summary,
          false_exclusion_evidence: trace.evidence,
          false_exclusion_traced_at: trace.tracedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('canonical_url', trace.canonicalUrl)
      if (error) {
        throw new Error(error.message)
      }
    }
  }
}
