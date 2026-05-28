export type SeoMetroSlug = string

export type SeoPilotMetro = {
  slug: SeoMetroSlug
  city: string
  state: string
  /** IANA timezone for weekend boundaries (Phase 3). */
  timezone: string
  /** Minimum active listings before metro qualifies for index rollout. */
  minActiveListings: number
}

export type SeoInventorySummary = {
  activeListingCount: number
  /** ISO timestamp of newest listing update in scope. */
  lastUpdatedAt: string | null
  /** Share of listings with lat/lng suitable for map + crawl (0–1). */
  crawlableInventoryPct: number
}

export type SeoMetroQualificationInput = {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  /** National indexing allowlist must pass before any metro indexes. */
  nationalIndexingAllowed: boolean
}

export type SeoMetroQualificationResult = {
  slug: SeoMetroSlug
  qualified: boolean
  score: number
  reasons: string[]
}

export type SeoRobotsDirective = {
  index: boolean
  follow: boolean
}

export type SeoPageKind = 'listing' | 'city' | 'weekend'
