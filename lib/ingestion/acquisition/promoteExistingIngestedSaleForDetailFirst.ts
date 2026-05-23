import { findPrimaryIngestedSaleBySourceUrl } from '@/lib/ingestion/identity/ingestedSaleSourceUrlLookup'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type DetailFirstIngestedSaleWriteRow = Record<string, unknown>

/**
 * When detail-first insert hits source_url uniqueness, promote the existing row to ready
 * instead of falling back to legacy (list crawl often inserted needs_geocode first).
 */
export async function promoteExistingIngestedSaleForDetailFirst(
  admin: ReturnType<typeof getAdminDb>,
  input: {
    sourceUrl: string
    row: DetailFirstIngestedSaleWriteRow
  }
): Promise<{ id: string } | null> {
  const sourceUrl = input.sourceUrl.trim()
  if (!sourceUrl) return null

  const primary = await findPrimaryIngestedSaleBySourceUrl(admin, sourceUrl, 'id, status, published_sale_id, is_duplicate')
  if (
    !primary?.id ||
    primary.is_duplicate ||
    primary.published_sale_id ||
    !['needs_geocode', 'needs_check', 'ready', 'publish_failed'].includes(String(primary.status))
  ) {
    return null
  }

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update(input.row)
    .eq('id', primary.id)
    .select('id')
    .maybeSingle()

  if (error || !data?.id) {
    return null
  }

  return { id: String(data.id) }
}

/**
 * Existing published row for the same detail URL counts as detail-first success (already captured).
 */
export async function findPublishedIngestedSaleIdForDetailFirst(
  admin: ReturnType<typeof getAdminDb>,
  sourceUrl: string
): Promise<string | null> {
  const trimmed = sourceUrl.trim()
  if (!trimmed) return null

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id')
    .eq('source_url', trimmed)
    .eq('is_duplicate', false)
    .not('published_sale_id', 'is', null)
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) {
    return null
  }

  return String(data.id)
}
