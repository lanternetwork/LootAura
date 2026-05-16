/** Refresh path for external source (explicit; never implicit). */
export type SourceRefreshCapability =
  | 'server_refetch_supported'
  | 'extension_assisted_required'
  | 'unsupported_for_reconciliation'

/** Stored reconciliation status on ingested_sales.source_sync_status */
export type SourceSyncStatus =
  | 'not_checked'
  | 'fresh'
  | 'changed'
  | 'unchanged'
  | 'source_missing_soft'
  | 'parse_failed'
  | 'sync_failed'

/** Deterministic material change tags from hash / placeholder comparison. */
export type ReconciliationChangeClass =
  | 'no_material_change'
  | 'description_changed'
  | 'images_changed'
  | 'schedule_changed'
  | 'placeholder_resolved'
  | 'placeholder_detected'
  | 'source_missing_soft'
  | 'parse_failed'

export interface IngestFingerprint {
  readonly contentHash: string
  readonly scheduleHash: string
  readonly imageHash: string
}

export interface ReconciliationCandidateRow {
  readonly id: string
  readonly source_url: string
  readonly source_platform: string
  readonly city: string | null
  readonly state: string | null
  readonly title: string | null
  readonly description: string | null
  readonly date_start: string | null
  readonly date_end: string | null
  readonly time_start: string | null
  readonly time_end: string | null
  readonly raw_payload: unknown
  readonly image_source_url: string | null
  readonly published_sale_id: string
  readonly last_source_sync_at: string | null
  readonly source_sync_status: string | null
  readonly source_sync_failure_count: number
  readonly source_placeholder_detected: boolean
  readonly source_content_hash: string | null
  readonly source_schedule_hash: string | null
  readonly source_image_hash: string | null
}
