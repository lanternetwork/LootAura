import { describe, expect, it } from 'vitest'
import {
  listNationwideDiscoveryStateCodes,
  pickDiscoveryStateBatch,
} from '@/lib/ingestion/discovery/discoveryStateCursor'

describe('discoveryStateCursor', () => {
  it('advances cursor round-robin without rescanning entire catalog per run', () => {
    const catalog = ['AL', 'AK', 'AZ', 'AR', 'CA']
    const first = pickDiscoveryStateBatch(0, 2, catalog)
    expect(first.states).toEqual(['AL', 'AK'])
    expect(first.nextCursor).toBe(2)

    const second = pickDiscoveryStateBatch(first.nextCursor, 2, catalog)
    expect(second.states).toEqual(['AZ', 'AR'])
    expect(second.nextCursor).toBe(4)

    const third = pickDiscoveryStateBatch(second.nextCursor, 2, catalog)
    expect(third.states).toEqual(['CA', 'AL'])
    expect(third.nextCursor).toBe(1)
  })

  it('never returns more states than catalog size', () => {
    const catalog = ['IL', 'IN']
    const batch = pickDiscoveryStateBatch(0, 50, catalog)
    expect(batch.states).toHaveLength(2)
  })

  it('lists nationwide catalog with stable ordering', () => {
    const codes = listNationwideDiscoveryStateCodes()
    expect(codes.length).toBeGreaterThan(40)
    const sorted = [...codes].sort((a, b) => a.localeCompare(b))
    expect(codes).toEqual(sorted)
  })
})
