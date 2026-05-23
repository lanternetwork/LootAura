import type { ExistingIngestedSaleCandidate } from '@/lib/ingestion/identity/classifySaleInstance'
import { fromBase, type getAdminDb } from '@/lib/supabase/clients'

export type IngestedSaleSourceUrlLookupRow = ExistingIngestedSaleCandidate & {
  published_sale_id?: string | null
  source_content_hash?: string | null
  source_listing_id?: string | null
  is_duplicate?: boolean
}

function comparePrimaryIngestedSaleRow(
  a: IngestedSaleSourceUrlLookupRow,
  b: IngestedSaleSourceUrlLookupRow
): number {
  const aSuperseded = Boolean(a.superseded_by_ingested_sale_id?.trim())
  const bSuperseded = Boolean(b.superseded_by_ingested_sale_id?.trim())
  if (aSuperseded !== bSuperseded) return aSuperseded ? 1 : -1
  return a.id.localeCompare(b.id)
}

/**
 * Deterministic primary row when multiple ingested_sales share source_url (Phase 10).
 * Prefers non-superseded rows; tie-breaks by smallest id.
 */
export function pickPrimaryIngestedSaleBySourceUrl<T extends IngestedSaleSourceUrlLookupRow>(
  rows: readonly T[]
): T | null {
  if (rows.length === 0) return null
  return [...rows].sort(comparePrimaryIngestedSaleRow)[0] ?? null
}

export async function listIngestedSalesBySourceUrl(
  admin: ReturnType<typeof getAdminDb>,
  sourceUrl: string,
  select: string
): Promise<IngestedSaleSourceUrlLookupRow[]> {
  const trimmed = sourceUrl.trim()
  if (!trimmed) return []

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select(select)
    .eq('source_url', trimmed)
    .order('id', { ascending: true })
    .limit(50)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as unknown) as IngestedSaleSourceUrlLookupRow[]
}

export async function findPrimaryIngestedSaleBySourceUrl(
  admin: ReturnType<typeof getAdminDb>,
  sourceUrl: string,
  select: string
): Promise<IngestedSaleSourceUrlLookupRow | null> {
  const rows = await listIngestedSalesBySourceUrl(admin, sourceUrl, select)
  return pickPrimaryIngestedSaleBySourceUrl(rows)
}

export async function findActiveIngestedSaleBySaleInstanceKey(
  admin: ReturnType<typeof getAdminDb>,
  sourcePlatform: string,
  saleInstanceKey: string
): Promise<{ id: string } | null> {
  const platform = sourcePlatform.trim()
  const key = saleInstanceKey.trim()
  if (!platform || !key) return null

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id')
    .eq('source_platform', platform)
    .eq('sale_instance_key', key)
    .is('superseded_by_ingested_sale_id', null)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return { id: String(data.id) }
}
