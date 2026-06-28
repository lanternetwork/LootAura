export type SeoEnablementSnapshotRow = {
  id: number
  coverage_pct: number | null
  effective_missing_valid: number | null
  duplicate_canonical_clusters: number | null
  published_active_inventory: number | null
  seo_gate_passed: boolean
  updated_at: string
}

export type SeoQualifiedMetroRow = {
  slug: string
  qualified: boolean
  listing_count: number
  crawlable_ratio: number
  city: string | null
  state: string | null
  timezone: string | null
  updated_at: string
}

export type SeoMetroInventoryRow = {
  metro_slug: string
  sale_id: string
  canonical_url: string
  title: string
  city: string
  state: string
  starts_at: string
  ends_at: string | null
  latitude: number
  longitude: number
  updated_at: string
  cover_image_url?: string | null
  address?: string | null
}

export type SeoMetroHistoryRow = {
  slug: string
  city: string
  state: string
  timezone: string
  inventory_count_90d: number
  last_seen_at: string | null
  updated_at: string
}

export type SeoSitemapInventoryRow = {
  sale_id: string
  canonical_url: string
  city_slug: string | null
  sort_order: number
  updated_at: string
}

export type SeoInfrastructureDiagnostics = {
  enablementSnapshotAgeMinutes: number | null
  qualifiedMetroSnapshotAgeMinutes: number | null
  inventorySnapshotAgeMinutes: number | null
  metroInventorySnapshotAgeMinutes: number | null
  qualifiedMetroCount: number
  sitemapInventoryCount: number
  metroInventoryCount: number
  metroGeographyCount: number
  geographyOverrideCount: number
}
