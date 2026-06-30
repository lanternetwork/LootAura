import { passesPhase4PublicVisibility } from '@/lib/admin/classifyPublishedNotVisibleBucket'
import type { LinkedSaleVisibilitySnapshot } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'
import type { FalseExclusionUrlTrace } from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { DiagnosticsWriteCounter } from '@/lib/admin/diagnostics/v4/performance/writeCounter'

const PERSIST_CHUNK = 100
const OBSERVATIONS_TABLE = 'ystm_coverage_observations'

export type FalseExclusionTracePersistContext = {
  ystmInvalidReason: string | null
  linkedSale: LinkedSaleVisibilitySnapshot | null
}

export type FalseExclusionTracePersistEntry = {
  trace: FalseExclusionUrlTrace
  persistContext: FalseExclusionTracePersistContext
}

/**
 * PUBLISHED_NOT_VISIBLE_TRACE_PERSIST_GUARD_V1 — skip re-applying PNV bucket on disposition-eligible rows.
 */
export function shouldSkipPublishedNotVisibleTracePersist(
  trace: Pick<FalseExclusionUrlTrace, 'primaryBucket'>,
  context: FalseExclusionTracePersistContext,
  nowMs: number = Date.now()
): boolean {
  if (trace.primaryBucket !== 'published_not_visible') return false

  const reason = context.ystmInvalidReason?.trim()
  if (reason === 'archived' || reason === 'expired') return true

  const linkedSale = context.linkedSale
  if (linkedSale != null && !passesPhase4PublicVisibility(linkedSale, nowMs)) return true

  return false
}

/**
 * Persists Phase 1 trace results on coverage observations (replay queue).
 */
export async function persistFalseExclusionTraces(
  admin: ReturnType<typeof getAdminDb>,
  entries: FalseExclusionTracePersistEntry[],
  nowMs: number = Date.now(),
  writeCounter?: DiagnosticsWriteCounter
): Promise<void> {
  if (entries.length === 0) return

  const nowIso = new Date(nowMs).toISOString()

  for (let i = 0; i < entries.length; i += PERSIST_CHUNK) {
    const slice = entries.slice(i, i + PERSIST_CHUNK)
    for (const { trace, persistContext } of slice) {
      const patch = shouldSkipPublishedNotVisibleTracePersist(trace, persistContext, nowMs)
        ? {
            false_exclusion_traced_at: trace.tracedAt,
            updated_at: nowIso,
          }
        : {
            false_exclusion_primary_bucket: trace.primaryBucket,
            false_exclusion_secondary_tags: trace.secondaryTags,
            false_exclusion_summary: trace.summary,
            false_exclusion_evidence: trace.evidence,
            false_exclusion_traced_at: trace.tracedAt,
            updated_at: nowIso,
          }

      const { error } = await fromBase(admin, OBSERVATIONS_TABLE)
        .update(patch)
        .eq('canonical_url', trace.canonicalUrl)
      if (error) {
        throw new Error(error.message)
      }
      writeCounter?.recordUpdate(OBSERVATIONS_TABLE, { sequential: true })
    }
  }
}
