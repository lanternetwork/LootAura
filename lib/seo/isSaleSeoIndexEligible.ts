import { passesPhase4PublicVisibility } from '@/lib/admin/classifyPublishedNotVisibleBucket'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'

export type SaleSeoIndexEligibilityInput = {
  status?: string | null
  archived_at?: string | null
  moderation_status?: string | null
  ends_at?: string | null
  external_source_url?: string | null
  lat?: number | null
  lng?: number | null
  /** Linked ingested row flags when known (sale-level duplicate suppression). */
  ingestedIsDuplicate?: boolean | null
  ingestedSuperseded?: boolean | null
}

export function isIngestedSaleDuplicateSuppressed(input: {
  is_duplicate?: boolean | null
  superseded_by_ingested_sale_id?: string | null
}): boolean {
  return input.is_duplicate === true || Boolean(input.superseded_by_ingested_sale_id?.trim())
}

/**
 * Shared SEO inventory eligibility — listings, sitemap rows, and metro inventory lists.
 * Cohort aligns with publishedActiveLootAuraYstmUrls (phase-4 + YSTM detail URL + map coords).
 */
export function isSaleSeoIndexEligible(
  sale: SaleSeoIndexEligibilityInput,
  nowMs: number = Date.now()
): boolean {
  if (!isYstmDetailListingUrl(sale.external_source_url)) return false
  if (sale.lat == null || sale.lng == null) return false

  if (sale.ingestedIsDuplicate === true || sale.ingestedSuperseded === true) {
    return false
  }

  return passesPhase4PublicVisibility(
    {
      status: sale.status ?? null,
      archived_at: sale.archived_at ?? null,
      moderation_status: sale.moderation_status ?? null,
      ends_at: sale.ends_at ?? null,
    },
    nowMs
  )
}
