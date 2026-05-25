/** Shared types for external page source + provider adapters (avoids import cycles). */

export interface ExternalPageSourceIngestionConfig {
  city: string
  state: string
  source_platform: string
  source_pages: unknown
}

export interface ExternalPageSourceListing {
  title: string
  description: string | null
  addressRaw: string | null
  city: string
  state: string
  startDate?: string
  endDate?: string
  sourceUrl: string
  imageSourceUrl: string | null
  rawPayload: Record<string, unknown>
}

export interface ParseExternalPageSourceResult {
  listings: ExternalPageSourceListing[]
  invalid: number
}
