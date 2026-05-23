import { updateExistingIngestedSaleForDetailFirst } from '@/lib/ingestion/acquisition/updateExistingIngestedSaleForDetailFirst'
import { findActiveIngestedSaleBySaleInstanceKey } from '@/lib/ingestion/identity/ingestedSaleSourceUrlLookup'
import type { getAdminDb } from '@/lib/supabase/clients'
import {
  findPublishedIngestedSaleIdForDetailFirst,
  promoteExistingIngestedSaleForDetailFirst,
  type DetailFirstIngestedSaleWriteRow,
} from '@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst'

/**
 * Phase 10: resolve insert collisions after source_url uniqueness is relaxed.
 * Tries URL promote (legacy), then active sale_instance_key update, then published URL match.
 */
export async function resolveIngestedSaleInsertCollision(
  admin: ReturnType<typeof getAdminDb>,
  input: {
    sourceUrl: string
    row: DetailFirstIngestedSaleWriteRow
  }
): Promise<{ id: string; publishedMatch?: boolean } | null> {
  const promoted = await promoteExistingIngestedSaleForDetailFirst(admin, {
    sourceUrl: input.sourceUrl,
    row: input.row,
  })
  if (promoted?.id) return promoted

  const saleInstanceKey =
    typeof input.row.sale_instance_key === 'string' ? input.row.sale_instance_key : null
  const sourcePlatform =
    typeof input.row.source_platform === 'string' ? input.row.source_platform : null
  if (saleInstanceKey?.trim() && sourcePlatform?.trim()) {
    const active = await findActiveIngestedSaleBySaleInstanceKey(
      admin,
      sourcePlatform,
      saleInstanceKey
    )
    if (active?.id) {
      const updated = await updateExistingIngestedSaleForDetailFirst(admin, {
        ingestedSaleId: active.id,
        row: input.row,
        reviveExpiredUrlReuse: true,
      })
      if (updated?.id) return updated
    }
  }

  const publishedId = await findPublishedIngestedSaleIdForDetailFirst(admin, input.sourceUrl)
  if (publishedId) {
    return { id: publishedId, publishedMatch: true }
  }

  return null
}
