export const NEEDS_CHECK_BLOCKER_CATEGORIES = [
  'address_enrichment_dependent',
  'address_gated',
  'precision_gated',
  'geocode_blocked',
  'publish_eligible_today',
  'other',
] as const

export type NeedsCheckBlockerCategory = (typeof NEEDS_CHECK_BLOCKER_CATEGORIES)[number]

export const NEEDS_CHECK_REPAIR_OWNERS = [
  'address_enrichment',
  'precision_handling',
  'catalog_repair',
  'geocoding',
  'other',
] as const

export type NeedsCheckRepairOwner = (typeof NEEDS_CHECK_REPAIR_OWNERS)[number]

export const NEEDS_CHECK_AGE_BUCKETS = ['under_7d', '7_to_30d', 'over_30d'] as const

export type NeedsCheckAgeBucket = (typeof NEEDS_CHECK_AGE_BUCKETS)[number]

export type NeedsCheckBlockerCategoryRow = {
  category: NeedsCheckBlockerCategory
  count: number
  pct: number
}

export type NeedsCheckAgeBucketRow = {
  bucket: NeedsCheckAgeBucket
  label: string
  count: number
  pct: number
}

export type NeedsCheckFailureSignalRow = {
  signal: string
  count: number
  pct: number
}

export type NeedsCheckPublishabilityRow = {
  profile: string
  count: number
  pct: number
}

export type NeedsCheckOwnerRow = {
  owner: NeedsCheckRepairOwner
  count: number
  pctNeedsCheck: number
  pctRepairQueue: number | null
}

export type NeedsCheckRootCauseAnalysis = {
  total: number
  scanned: number
  byBlockerCategory: Record<NeedsCheckBlockerCategory, number>
  byAgeBucket: Record<NeedsCheckAgeBucket, number>
  byPublishability: Record<string, number>
  failureSignals: Record<string, number>
  allPairs: Array<{
    addressStatus: string
    coordinatePrecision: string
    count: number
    pct: number
  }>
}

export type NeedsCheckRootCauseDiscovery = {
  generatedAt: string
  analysis: NeedsCheckRootCauseAnalysis
  needsCheck: number
  repairQueue: number | null
  needsCheckPctOfRepairQueue: number | null
  blockerCategories: NeedsCheckBlockerCategoryRow[]
  ageBuckets: NeedsCheckAgeBucketRow[]
  publishability: NeedsCheckPublishabilityRow[]
  failureSignals: NeedsCheckFailureSignalRow[]
  owners: NeedsCheckOwnerRow[]
  dominantCategory: NeedsCheckBlockerCategory | null
  dominantOwner: NeedsCheckRepairOwner | null
  explainingCategories: NeedsCheckBlockerCategory[]
  explainingCategoriesPct: number
  discoveryComplete: boolean
  repairScopeRecommendation: string | null
  classificationRulesSummary: string
}
