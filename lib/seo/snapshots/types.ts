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
  qualifiedMetroCount: number
  sitemapInventoryCount: number
}
