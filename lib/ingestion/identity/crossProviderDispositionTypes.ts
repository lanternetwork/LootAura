export type CrossProviderMatchConfidence = 'high' | 'medium' | 'ambiguous' | 'distinct'

export type CrossProviderShadowDisposition =
  | 'would_link_observation'
  | 'would_suppress_publish'
  | 'would_observation_review'
  | 'would_publish_distinct'

export type CrossProviderMatchMethod =
  | 'canonical_key_exact'
  | 'canonical_plus_geo'
  | 'address_plus_geo'
  | 'geo_schedule_title'
  | 'organizer_overlap'
  | 'none'

export type CrossProviderConvergenceCandidate = {
  id: string
  source_platform: string | null
  source_url: string | null
  canonical_sale_instance_key: string | null
  published_sale_id: string | null
  is_duplicate: boolean
  date_start: string | null
  date_end: string | null
  normalized_address: string | null
  title: string | null
  lat: number | null
  lng: number | null
}

export type CrossProviderIngestDispositionInput = {
  incomingPlatform: string
  incomingCanonicalKey: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  normalizedTitle: string | null
  lat: number | null
  lng: number | null
  candidates: readonly CrossProviderConvergenceCandidate[]
}

export type CrossProviderIngestDispositionResult = {
  confidence: CrossProviderMatchConfidence
  disposition: CrossProviderShadowDisposition
  matchMethod: CrossProviderMatchMethod
  matchReasons: string[]
  primaryIngestedSaleId: string | null
  matchedIngestedSaleId: string | null
  matchedPlatform: string | null
  matchedCanonicalKey: string | null
  matchedPublishedSaleId: string | null
  /** Phase B exit metric: proposed distinct publish while canonical already published elsewhere. */
  isFalseNegative: boolean
}
