/**
 * Phase 1 false-exclusion audit: primary bucket per missing valid YSTM URL.
 * @see docs/YSTM_FALSE_EXCLUSION_AUDIT.md
 */

export const FALSE_EXCLUSION_TRACE_BUCKETS = [
  'never_crawled',
  'crawl_not_yet_rotated',
  'url_duplicate_suppressed',
  'url_reuse_suspected',
  'soft_dedupe_suppressed',
  'expired_false_positive',
  'gated_false_positive',
  'detail_first_fallback',
  'address_validation_failed',
  'spatial_lookup_failed',
  'insert_failed',
  'publish_failed',
  'repair_pending',
  'repair_failed',
  'published_not_visible',
  'unknown',
] as const

export type FalseExclusionTraceBucket = (typeof FALSE_EXCLUSION_TRACE_BUCKETS)[number]

export function isFalseExclusionTraceBucket(value: string): value is FalseExclusionTraceBucket {
  return (FALSE_EXCLUSION_TRACE_BUCKETS as readonly string[]).includes(value)
}

/** Optional tags when multiple signals apply (primary bucket still exactly one). */
export type FalseExclusionSecondaryTag =
  | 'config_not_crawlable'
  | 'config_crawl_excluded'
  | 'missing_ingest_never_attempted'
  | 'missing_ingest_failed'
  | 'catalog_repair_queue'
  | 'observation_stale'

export type FalseExclusionTraceEvidence = {
  hasIngestedRow: boolean
  ingestedStatus: string | null
  ingestedPublishedSaleId: string | null
  isDuplicate: boolean
  addressStatus: string | null
  configEnabled: boolean | null
  configHasSourcePages: boolean | null
  configCrawlExcluded: boolean | null
  configLastCrawlAt: string | null
  missingIngestionOutcome: string | null
  missingIngestionFailureReason: string | null
  visibleInPublishedIndex: boolean
  catalogRepairEligible: boolean
}

export type FalseExclusionUrlTrace = {
  canonicalUrl: string
  state: string | null
  city: string | null
  configKey: string | null
  primaryBucket: FalseExclusionTraceBucket
  secondaryTags: FalseExclusionSecondaryTag[]
  summary: string
  evidence: FalseExclusionTraceEvidence
  tracedAt: string
}

export type FalseExclusionAuditReport = {
  generatedAt: string
  missingValidCount: number
  tracedCount: number
  byPrimaryBucket: Record<FalseExclusionTraceBucket, number>
  traces: FalseExclusionUrlTrace[]
}
