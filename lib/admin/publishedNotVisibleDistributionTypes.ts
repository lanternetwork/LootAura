import type { MissingValidReconciliationClass } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliationTypes'
import type { LinkedSaleVisibilitySnapshot } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'

export const PUBLISHED_NOT_VISIBLE_BUCKETS = [
  'VISIBLE_SALE',
  'NO_MATCHED_SALE',
  'MISMATCH',
  'ARCHIVED',
  'MODERATION_HIDDEN',
  'EXPIRED',
  'STALE_OBSERVATION',
  'OTHER',
] as const

export type PublishedNotVisibleBucket = (typeof PUBLISHED_NOT_VISIBLE_BUCKETS)[number]

export const PUBLISHED_NOT_VISIBLE_VERDICTS = [
  'PUBLISHED_NOT_VISIBLE_DISPOSITION_REPAIR_V1',
  'PUBLISHED_NOT_VISIBLE_RECONCILIATION_REPAIR_V1',
  'PUBLISHED_NOT_VISIBLE_MATCHING_REPAIR_V1',
  'COVERAGE_VISIBILITY_AUDIT_BUG_V1',
  'OTHER',
] as const

export type PublishedNotVisibleVerdict = (typeof PUBLISHED_NOT_VISIBLE_VERDICTS)[number]

export type PublishedNotVisibleObservationRow = {
  canonical_url: string
  matched_sale_id: string | null
  matched_ingested_sale_id: string | null
  sale_instance_key: string | null
  lootaura_visible: boolean | null
  appearance_source: string | null
  false_exclusion_secondary_tags: string[] | null
  match_method: string | null
  missing_ingestion_outcome: string | null
  missing_ingestion_failure_reason: string | null
  missing_ingestion_replay_count: number | null
}

export type PublishedNotVisibleIngestedRow = {
  id: string
  source_url: string
  status: string | null
  published_sale_id: string | null
  sale_instance_key: string | null
  is_duplicate: boolean
}

export type PublishedNotVisibleSaleRow = LinkedSaleVisibilitySnapshot & {
  id: string
}

export type PublishedNotVisibleClassifiedRow = {
  canonicalUrl: string
  bucket: PublishedNotVisibleBucket
  reconciliationClass: MissingValidReconciliationClass
  visibilityFilterZombie: boolean
  observationStaleTag: boolean
  passesPhase4PublicVisibility: boolean
  matchedSaleId: string | null
  matchedIngestedSaleId: string | null
  ingestedSaleId: string | null
  ingestedPublishedSaleId: string | null
  saleId: string | null
  appearanceSource: string | null
  matchMethod: string | null
  secondaryTags: string[]
  endsAt: string | null
  archivedAt: string | null
  moderationStatus: string | null
  saleStatus: string | null
}

export type PublishedNotVisibleBucketRow = {
  bucket: PublishedNotVisibleBucket
  count: number
  pct: number
}

export type PublishedNotVisibleReconciliationRow = {
  reconciliationClass: MissingValidReconciliationClass
  count: number
  pct: number
}

export type PublishedNotVisibleDistributionAnalysis = {
  generatedAt: string
  cohortTotal: number
  byBucket: Record<PublishedNotVisibleBucket, number>
  byReconciliationClass: Record<string, number>
  visibilityFilterZombieCount: number
  observationStaleTagCount: number
  publishHookCount: number
}

export type PublishedNotVisibleDistributionDiscovery = {
  generatedAt: string
  analysis: PublishedNotVisibleDistributionAnalysis
  bucketRows: PublishedNotVisibleBucketRow[]
  reconciliationRows: PublishedNotVisibleReconciliationRow[]
  dominantBucket: PublishedNotVisibleBucket | null
  dominantBucketPct: number
  dispositionSharePct: number
  staleSharePct: number
  matchingSharePct: number
  publishHookSharePct: number
  verdict: PublishedNotVisibleVerdict
  verdictRationale: string
  sampleRows: PublishedNotVisibleClassifiedRow[]
  auditComplete: boolean
}
