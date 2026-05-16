/**
 * Deterministic models for SKIP LOCKED–style batch claiming: sorted row ids + non-overlapping slices
 * approximate concurrent workers that each claim the lowest available keys without duplicates.
 */

/** Stable sort for claim keys (UUIDs / lexicographic ids). */
export function sortClaimIdsDeterministic(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b))
}

/**
 * Partition sorted ids into consecutive batches (same ordering as SQL ORDER BY id LIMIT n FOR UPDATE SKIP LOCKED per worker pass).
 */
export function partitionSortedClaimIds(sortedIds: readonly string[], batchSize: number): string[][] {
  const b = Math.max(1, Math.floor(batchSize))
  const out: string[][] = []
  for (let i = 0; i < sortedIds.length; i += b) {
    out.push(sortedIds.slice(i, i + b))
  }
  return out
}

export function assertNoDuplicateClaimAssignments(assignments: readonly (readonly string[])[]): void {
  const seen = new Set<string>()
  for (const group of assignments) {
    for (const id of group) {
      if (seen.has(id)) throw new Error(`duplicate claim assignment for id=${id}`)
      seen.add(id)
    }
  }
}
