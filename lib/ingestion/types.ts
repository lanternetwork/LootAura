export const FAILURE_REASONS = [
  'missing_address',
  'missing_city_config',
  'invalid_address_format',
  'geocode_failed',
  'missing_date',
  'invalid_date',
  'ambiguous_date',
  'invalid_time',
  'conflicting_time',
  'duplicate_detected',
  'parse_failed',
  'publish_error',
] as const

export type FailureReason = (typeof FAILURE_REASONS)[number]

export type TimeSource = 'explicit' | 'default'
export type ParseConfidence = 'high' | 'low'
export type IngestionStatus =
  | 'ready'
  | 'needs_check'
  | 'needs_geocode'
  | 'publishing'
  | 'published'
  | 'publish_failed'
  | 'rejected'

/**
 * Adapter output payload for ingestion.
 * Represents raw source data before normalization/validation.
 */
export interface RawExternalSale {
  sourcePlatform: string
  sourceUrl: string
  externalId: string | null
  title: string | null
  description: string | null
  addressRaw: string | null
  dateRaw: string | number | null
  imageSourceUrl: string | null
  rawPayload: unknown
  cityHint: string
  stateHint: string
}

/**
 * Normalized and validated record before DB upsert into ingested_sales.
 */
export interface ProcessedIngestedSale {
  normalizedAddress: string | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  dateStart: string | null
  dateEnd: string | null
  timeStart: string | null
  timeEnd: string | null
  timeSource: TimeSource | null
  dateSource: string | null
  status: IngestionStatus
  failureReasons: FailureReason[]
  parseConfidence: ParseConfidence
}

export interface IngestionRunSummary {
  fetched: number
  created: number
  updated: number
  ready: number
  needsCheck: number
  duplicates: number
  published: number
  failed: number
}

/**
 * Mirrors ingestion_city_configs table shape used by ingestion execution.
 */
export interface CityIngestionConfig {
  city: string
  state: string
  timezone: string
  enabled: boolean
  sourcePlatform: string
  /** Absolute list-page URLs (`http`/`https`); primary driver for `external_page_source` cron ingestion. */
  sourcePages: string[]
}

/**
 * Input contract for shared publish service.
 */
export interface PublishInput {
  ownerId: string
  title: string
  description: string | null
  address: string | null
  city: string
  state: string
  zipCode: string | null
  lat: number
  lng: number
  dateStart: string
  dateEnd: string | null
  timeStart: string
  timeEnd: string | null
  coverImageUrl: string | null
  images: string[] | null
  importSource: string
  externalSourceUrl: string
  ingestedSaleId: string
}

