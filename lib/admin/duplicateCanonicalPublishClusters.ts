import {
  groupDuplicateCanonicalPublishClusters,
  type DuplicateCanonicalPublishCluster,
} from '@/lib/admin/duplicateCanonicalPublishClusterTypes'
import { EXTERNAL_INGEST_PLATFORMS } from '@/lib/ingestion/identity/backfillCanonicalSaleInstanceKey'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type {
  DuplicateCanonicalPublishCluster,
  DuplicateCanonicalPublishClusterRow,
} from '@/lib/admin/duplicateCanonicalPublishClusterTypes'

export { groupDuplicateCanonicalPublishClusters } from '@/lib/admin/duplicateCanonicalPublishClusterTypes'

type PublishedCanonicalRow = {
  ingestedSaleId: string
  publishedSaleId: string
  canonicalSaleInstanceKey: string
  sourcePlatform: string
  sourceUrl: string
  city: string | null
  state: string | null
}

/**
 * Operational SLO: canonical keys with more than one distinct published_sale_id across external ingests.
 */
export async function listDuplicatePublishedCanonicalClusters(
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  maxClusters = 50
): Promise<DuplicateCanonicalPublishCluster[]> {
  const platforms = [...EXTERNAL_INGEST_PLATFORMS]
  const pageSize = 500
  let from = 0
  const publishedRows: PublishedCanonicalRow[] = []

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, canonical_sale_instance_key, published_sale_id, source_platform, source_url, city, state'
      )
      .in('source_platform', platforms)
      .eq('status', 'published')
      .not('canonical_sale_instance_key', 'is', null)
      .not('published_sale_id', 'is', null)
      .is('superseded_by_ingested_sale_id', null)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = data ?? []
    for (const raw of chunk) {
      const row = raw as {
        id?: string
        canonical_sale_instance_key?: string | null
        published_sale_id?: string | null
        source_platform?: string | null
        source_url?: string | null
        city?: string | null
        state?: string | null
      }
      const canonicalSaleInstanceKey = row.canonical_sale_instance_key?.trim()
      const publishedSaleId = row.published_sale_id?.trim()
      const ingestedSaleId = row.id?.trim()
      if (!canonicalSaleInstanceKey || !publishedSaleId || !ingestedSaleId) continue
      publishedRows.push({
        ingestedSaleId,
        publishedSaleId,
        canonicalSaleInstanceKey,
        sourcePlatform: row.source_platform?.trim() || 'unknown',
        sourceUrl: row.source_url?.trim() || '',
        city: row.city ?? null,
        state: row.state ?? null,
      })
    }

    if (chunk.length < pageSize) break
    from += pageSize
  }

  return groupDuplicateCanonicalPublishClusters(publishedRows).slice(0, maxClusters)
}

export async function countDuplicatePublishedCanonicalClusters(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<number> {
  const clusters = await listDuplicatePublishedCanonicalClusters(admin, 10_000)
  return clusters.length
}
