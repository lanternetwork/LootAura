import type { ListFastIngestedJoinRow, ListFastSaleJoinRow } from '@/lib/admin/listFastFailureDistributionTypes'
import { isLinkedSaleVisibilityFiltered } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'

export type ListFastInsertCollisionDrilldown = {
  sameSourceUrlMatch: boolean
  sameInstanceKeyMatch: boolean
  sameInstanceKeyDifferentUrl: boolean
  publishedMatch: boolean
  duplicateMatch: boolean
  expiredMatch: boolean
  phase4Visible: boolean
  noCollisionMatch: boolean
}

export function classifyListFastInsertCollisionDrilldown(input: {
  canonicalUrl: string
  saleInstanceKey: string | null
  sourceUrlMatches: ListFastIngestedJoinRow[]
  instanceKeyMatches: ListFastIngestedJoinRow[]
  salesById: Map<string, ListFastSaleJoinRow>
  nowMs?: number
}): ListFastInsertCollisionDrilldown {
  const canonical = input.canonicalUrl.trim()
  const sourceMatches = input.sourceUrlMatches.filter((row) => !row.is_duplicate)
  const instanceMatches = input.instanceKeyMatches.filter(
    (row) => row.is_duplicate !== true && !row.superseded_by_ingested_sale_id
  )

  const sameSourceUrlMatch = sourceMatches.length > 0
  const sameInstanceKeyMatch = instanceMatches.length > 0
  const sameInstanceKeyDifferentUrl = instanceMatches.some(
    (row) => row.source_url.trim() !== canonical
  )

  const publishedMatch = [...sourceMatches, ...instanceMatches].some((row) => row.published_sale_id)
  const duplicateMatch = [...input.sourceUrlMatches, ...input.instanceKeyMatches].some(
    (row) => row.is_duplicate === true
  )
  const expiredMatch = [...sourceMatches, ...instanceMatches].some((row) => row.status === 'expired')

  let phase4Visible = false
  for (const row of [...sourceMatches, ...instanceMatches]) {
    if (!row.published_sale_id) continue
    const sale = input.salesById.get(row.published_sale_id)
    if (sale && !isLinkedSaleVisibilityFiltered(sale, input.nowMs)) {
      phase4Visible = true
      break
    }
  }

  const noCollisionMatch = !sameSourceUrlMatch && !sameInstanceKeyMatch

  return {
    sameSourceUrlMatch,
    sameInstanceKeyMatch,
    sameInstanceKeyDifferentUrl,
    publishedMatch,
    duplicateMatch,
    expiredMatch,
    phase4Visible,
    noCollisionMatch,
  }
}
