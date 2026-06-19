export type LinkedSaleVisibilitySnapshot = {
  status: string | null
  archived_at: string | null
  ends_at: string | null
  moderation_status: string | null
}

/** Linked sale fails public visibility (archived / expired / moderated hidden). */
export function isLinkedSaleVisibilityFiltered(
  sale: LinkedSaleVisibilitySnapshot,
  nowMs: number = Date.now()
): boolean {
  if (sale.status === 'archived') return true
  if (sale.archived_at) return true
  if (sale.moderation_status === 'hidden_by_admin') return true
  if (sale.ends_at) {
    const endsAtMs = Date.parse(sale.ends_at)
    if (Number.isFinite(endsAtMs) && endsAtMs <= nowMs) return true
  }
  return false
}
