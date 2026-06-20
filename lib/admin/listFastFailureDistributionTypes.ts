import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

export const LIST_FAST_FAILURE_REASONS = [
  'unparseable_detail',
  'missing_title',
  'missing_dates',
  'expired',
  'gated_only',
  'geocode_unavailable',
  'insert_failed',
] as const

export type ListFastFailureReason = (typeof LIST_FAST_FAILURE_REASONS)[number]

export const LIST_FAST_SNAPSHOT_COMPLETENESS_BUCKETS = [
  'complete_snapshot',
  'missing_snapshot',
  'missing_dates',
  'missing_title',
  'missing_address_and_coords',
  'missing_coords_only',
  'validity_rejected_other',
] as const

export type ListFastSnapshotCompletenessBucket =
  (typeof LIST_FAST_SNAPSHOT_COMPLETENESS_BUCKETS)[number]

export const LIST_FAST_PUBLISH_SUPPRESSION_SIGNALS = [
  'existing_published_sale_linked',
  'sale_instance_key_collision',
  'archived_at_not_null',
  'ends_at_past',
  'moderation_hidden',
  'published_but_observation_stale',
] as const

export type ListFastPublishSuppressionSignal =
  (typeof LIST_FAST_PUBLISH_SUPPRESSION_SIGNALS)[number]

export const LIST_FAST_GEOCODE_IMPACT_BUCKETS = [
  'native_coords_in_snapshot',
  'geocode_unavailable_failure',
  'validity_gated_before_geocode',
  'insert_failed_after_geocode',
  'other_failure_path',
] as const

export type ListFastGeocodeImpactBucket = (typeof LIST_FAST_GEOCODE_IMPACT_BUCKETS)[number]

export const LIST_FAST_F1_CLASSIFICATIONS = [
  'GEOCODE_BLOCKED',
  'SNAPSHOT_VALIDITY_DOMINANT',
  'INSERT_FAILURE_DOMINANT',
  'MIXED_FAILURES',
  'INSUFFICIENT_DATA',
] as const

export type ListFastF1Classification = (typeof LIST_FAST_F1_CLASSIFICATIONS)[number]

export const LIST_FAST_F2_CLASSIFICATIONS = [
  'PUBLISH_GAP_DOMINANT',
  'INGESTED_NEEDS_GEOCODE',
  'INGESTED_NEEDS_CHECK',
  'INGESTED_OTHER',
  'NO_INGESTED_COHORT',
] as const

export type ListFastF2Classification = (typeof LIST_FAST_F2_CLASSIFICATIONS)[number]

export type ListFastFailureReasonRow = {
  reason: string
  count: number
  pct: number
}

export type ListFastSnapshotCompletenessRow = {
  bucket: ListFastSnapshotCompletenessBucket
  count: number
  pct: number
}

export type ListFastPublishSuppressionRow = {
  signal: ListFastPublishSuppressionSignal
  count: number
  pct: number
}

export type ListFastGeocodeImpactRow = {
  bucket: ListFastGeocodeImpactBucket
  count: number
  pct: number
}

export type ListFastFailureDistributionAnalysis = {
  generatedAt: string
  cohortWindowHours: number
  totalFailedHot24h: number
  totalFailedHotWarm24h: number
  totalIngestedHot24h: number
  hotQueueDepth: number
  oldestFailedAgeHours: number | null
  newestFailedAgeHours: number | null
  byFailureReason: Record<string, number>
  bySnapshotCompleteness: Record<ListFastSnapshotCompletenessBucket, number>
  byPublishSuppression: Record<ListFastPublishSuppressionSignal, number>
  byGeocodeImpact: Record<ListFastGeocodeImpactBucket, number>
  ingestedByStatus: Record<string, number>
  ingestedNeedsGeocodeCount: number
  ingestedPublishFailedCount: number
}

export type ListFastFailureDistributionDiscovery = {
  generatedAt: string
  analysis: ListFastFailureDistributionAnalysis
  failureReasonRows: ListFastFailureReasonRow[]
  dominantFailureReason: string | null
  dominantFailureReasonPct: number
  dominantFailureReasonOver70: boolean
  snapshotCompletenessRows: ListFastSnapshotCompletenessRow[]
  publishSuppressionRows: ListFastPublishSuppressionRow[]
  geocodeImpactRows: ListFastGeocodeImpactRow[]
  f1Classification: ListFastF1Classification
  f2Classification: ListFastF2Classification
  recommendedRepairSpec: string | null
  auditComplete: boolean
  reconciliationNote: string
}

export type ListFastFailureObservationRow = {
  canonical_url: string
  missing_ingestion_failure_reason: string | null
  missing_ingestion_attempted_at: string | null
  list_metadata_snapshot: unknown
  sale_instance_key: string | null
  lootaura_visible: boolean | null
  discovery_priority: string | null
}

export type ListFastIngestedJoinRow = {
  id: string
  source_url: string
  status: string | null
  published_sale_id: string | null
  sale_instance_key: string | null
  archived_at: string | null
  address_status: string | null
}

export type ListFastSaleJoinRow = {
  id: string
  archived_at: string | null
  ends_at: string | null
  moderation_status: string | null
  status: string | null
}

export type ParsedListFastSnapshot = YstmListMetadataSale | null
