import { describe, expect, it } from 'vitest'
import {
  assertNoDuplicateClaimAssignments,
  partitionSortedClaimIds,
  sortClaimIdsDeterministic,
} from '@/lib/operationalResilience/skipLockedClaimModel'

describe('skipLockedClaimModel', () => {
  it('sorts claim ids deterministically', () => {
    expect(sortClaimIdsDeterministic(['b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('partitions sorted ids into stable consecutive batches (archive/publish/geocode analogue)', () => {
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5']
    const parts = partitionSortedClaimIds(ids, 2)
    expect(parts).toEqual([['r1', 'r2'], ['r3', 'r4'], ['r5']])
    assertNoDuplicateClaimAssignments(parts)
  })

  it('supports concurrent workers taking disjoint partition slices without duplicate ids', () => {
    const sorted = sortClaimIdsDeterministic(['w-10', 'w-2', 'w-3', 'w-7'])
    const batches = partitionSortedClaimIds(sorted, 2)
    assertNoDuplicateClaimAssignments(batches)
    const flat = batches.flat()
    expect(new Set(flat).size).toBe(flat.length)
    expect(flat.sort()).toEqual(['w-10', 'w-2', 'w-3', 'w-7'].sort())
  })
})
