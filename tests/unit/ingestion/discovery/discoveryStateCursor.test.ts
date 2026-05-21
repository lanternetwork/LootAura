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

  it('lists nationwide catalog with Phase 2 priority states first', () => {
    const codes = listNationwideDiscoveryStateCodes()
    expect(codes.length).toBeGreaterThan(40)
    expect(codes[0]).toBe('IL')
    expect(codes.indexOf('TX')).toBeLessThan(codes.indexOf('WY'))
    expect(new Set(codes).size).toBe(codes.length)
  })
})
