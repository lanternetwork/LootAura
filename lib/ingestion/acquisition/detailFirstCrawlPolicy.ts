import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import {
  evaluateDuplicateSkipForExternalListListing,
  type ExternalListDuplicateProbe,
} from '@/lib/ingestion/dedupe'
import type { getAdminDb } from '@/lib/supabase/clients'

/**
 * List-parse soft dedupe uses slug/nearby addresses that detail-first would replace.
 * Defer until after detail HTML is merged (detail-first path or legacy fallback insert).
 */
export function shouldDeferListSeedSoftDedupe(sourceUrl: string): boolean {
  return isYstmDetailListingUrl(sourceUrl)
}

export async function evaluatePostDetailEnrichedDuplicateSkip(
  admin: ReturnType<typeof getAdminDb>,
  platform: string,
  probe: ExternalListDuplicateProbe
) {
  return evaluateDuplicateSkipForExternalListListing(admin, platform, probe)
}
