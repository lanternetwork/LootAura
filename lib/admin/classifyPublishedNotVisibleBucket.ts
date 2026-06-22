import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import type { LinkedSaleVisibilitySnapshot } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'
import type {
  PublishedNotVisibleBucket,
  PublishedNotVisibleIngestedRow,
  PublishedNotVisibleObservationRow,
  PublishedNotVisibleSaleRow,
} from '@/lib/admin/publishedNotVisibleDistributionTypes'

export type ClassifyPublishedNotVisibleBucketInput = {
  observation: PublishedNotVisibleObservationRow
  ingested: PublishedNotVisibleIngestedRow | null
  linkedSale: PublishedNotVisibleSaleRow | null
  linkedSaleId: string | null
  visibleInPublishedIndex: boolean
  nowMs?: number
}

/** Phase 4 public visibility — mirrors phase4PublicPublishedSaleReadFilters. */
export function passesPhase4PublicVisibility(
  sale: LinkedSaleVisibilitySnapshot & { status?: string | null },
  nowMs: number = Date.now()
): boolean {
  if (sale.status !== 'published') return false
  if (sale.archived_at) return false
  if (sale.moderation_status === 'hidden_by_admin') return false
  if (sale.ends_at) {
    const endsAtMs = Date.parse(sale.ends_at)
    if (Number.isFinite(endsAtMs) && endsAtMs <= nowMs) return false
  }
  return true
}

function isArchivedSale(sale: PublishedNotVisibleSaleRow): boolean {
  return sale.status === 'archived' || Boolean(sale.archived_at)
}

function isModerationHiddenSale(sale: PublishedNotVisibleSaleRow): boolean {
  return sale.moderation_status === 'hidden_by_admin'
}

function isExpiredSale(sale: PublishedNotVisibleSaleRow, nowMs: number): boolean {
  if (isArchivedSale(sale)) return false
  if (!sale.ends_at) return false
  const endsAtMs = Date.parse(sale.ends_at)
  return Number.isFinite(endsAtMs) && endsAtMs <= nowMs
}

function hasResolvableLinkage(input: ClassifyPublishedNotVisibleBucketInput): boolean {
  const { observation, ingested, linkedSaleId } = input
  return Boolean(
    linkedSaleId ||
      observation.matched_sale_id ||
      observation.matched_ingested_sale_id ||
      ingested?.published_sale_id ||
      ingested?.id
  )
}

export function detectPublishedNotVisibleMismatch(input: ClassifyPublishedNotVisibleBucketInput): boolean {
  const { observation, ingested, linkedSale } = input
  const nowMs = input.nowMs ?? Date.now()
  if (!ingested) return false

  const publishedId = ingested.published_sale_id?.trim() || null
  const matchedId = observation.matched_sale_id?.trim() || null
  if (publishedId && matchedId && publishedId !== matchedId) return true

  const obsKey = observation.sale_instance_key?.trim() || null
  const ingestedKey = ingested.sale_instance_key?.trim() || null
  if (obsKey && ingestedKey && obsKey !== ingestedKey) return true

  const canonicalObs = canonicalSourceUrl(observation.canonical_url)
  const canonicalIngested = canonicalSourceUrl(ingested.source_url)
  if (canonicalObs && canonicalIngested && canonicalObs !== canonicalIngested) {
    if (linkedSale && !passesPhase4PublicVisibility(linkedSale, nowMs)) {
      return false
    }
    return true
  }

  return false
}

function isStaleObservation(input: ClassifyPublishedNotVisibleBucketInput, nowMs: number): boolean {
  const { observation, linkedSale, visibleInPublishedIndex } = input
  const tags = observation.false_exclusion_secondary_tags ?? []

  if (visibleInPublishedIndex) return true
  if (tags.includes('observation_stale')) return true

  const outcome = observation.missing_ingestion_outcome
  if (outcome === 'ingested' || outcome === 'published') return true

  if (linkedSale && passesPhase4PublicVisibility(linkedSale, nowMs)) return true

  return false
}

/**
 * Ordered first-match bucket for published_not_visible false-exclusion cohort.
 */
export function classifyPublishedNotVisibleBucket(
  input: ClassifyPublishedNotVisibleBucketInput
): PublishedNotVisibleBucket {
  const nowMs = input.nowMs ?? Date.now()
  const { linkedSale } = input

  if (linkedSale && passesPhase4PublicVisibility(linkedSale, nowMs)) {
    return 'VISIBLE_SALE'
  }

  if (!hasResolvableLinkage(input)) {
    return 'NO_MATCHED_SALE'
  }

  if (linkedSale) {
    if (isArchivedSale(linkedSale)) return 'ARCHIVED'
    if (isModerationHiddenSale(linkedSale)) return 'MODERATION_HIDDEN'
    if (isExpiredSale(linkedSale, nowMs)) return 'EXPIRED'
  }

  if (detectPublishedNotVisibleMismatch(input)) {
    return 'MISMATCH'
  }

  if (isStaleObservation(input, nowMs)) {
    return 'STALE_OBSERVATION'
  }

  return 'OTHER'
}
