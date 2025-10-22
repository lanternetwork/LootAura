import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock applySalesResult function
const mockApplySalesResult = vi.fn()

// Mock intent and sequence management
let currentSeq = 0
let currentIntent = { kind: 'Filters' as const }

const bumpSeq = (intent: any) => {
  currentSeq += 1
  currentIntent = intent
}

const applySalesResult = (incoming: { data: any[]; seq: number; cause: string }, target: string) => {
  // Gate: apply only if res.seq >= currentSeq and compatible
  if (incoming.seq < currentSeq) {
    console.debug('[APPLY] drop stale', { incomingSeq: incoming.seq, currentSeq })
    return 'drop:stale'
  }
  
  // Simple compatibility check
  const isCompatible = (cause: string, intent: any) => {
    if (intent.kind === 'Filters') return cause === 'Filters'
    if (intent.kind === 'UserPan') return cause === 'UserPan' || cause === 'Filters'
    if (intent.kind === 'ClusterDrilldown') return cause === 'ClusterDrilldown' || cause === 'Filters'
    return false
  }
  
  if (!isCompatible(incoming.cause, currentIntent)) {
    console.debug('[APPLY] drop incompatible', { cause: incoming.cause, intent: currentIntent.kind })
    return 'drop:incompatible'
  }
  
  mockApplySalesResult(incoming, target)
  return 'ok:apply'
}

describe('Fetch Apply Gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentSeq = 0
    currentIntent = { kind: 'Filters' }
  })

  it('Case A: newer seq wins → expect "ok:apply"', () => {
    bumpSeq({ kind: 'Filters' })
    const mySeq = currentSeq // 1
    
    const result = applySalesResult({
      data: [{ id: '1', title: 'Sale 1' }],
      seq: mySeq,
      cause: 'Filters'
    }, 'map')
    
    expect(result).toBe('ok:apply')
    expect(mockApplySalesResult).toHaveBeenCalledWith({
      data: [{ id: '1', title: 'Sale 1' }],
      seq: mySeq,
      cause: 'Filters'
    }, 'map')
  })

  it('Case B: older seq → expect "drop:stale"', () => {
    bumpSeq({ kind: 'Filters' })
    const mySeq = currentSeq // 1
    
    // Simulate a newer intent
    bumpSeq({ kind: 'UserPan' })
    const newerSeq = currentSeq // 2
    
    const result = applySalesResult({
      data: [{ id: '1', title: 'Sale 1' }],
      seq: mySeq, // 1, which is < 2
      cause: 'Filters'
    }, 'map')
    
    expect(result).toBe('drop:stale')
    expect(mockApplySalesResult).not.toHaveBeenCalled()
  })

  it('Case C: incompatible intent → expect "drop:incompatible"', () => {
    bumpSeq({ kind: 'Filters' })
    const mySeq = currentSeq // 1
    
    const result = applySalesResult({
      data: [{ id: '1', title: 'Sale 1' }],
      seq: mySeq,
      cause: 'UserPan' // Incompatible with Filters intent
    }, 'map')
    
    expect(result).toBe('drop:incompatible')
    expect(mockApplySalesResult).not.toHaveBeenCalled()
  })

  it('allows UserPan to accept Filters cause', () => {
    bumpSeq({ kind: 'UserPan' })
    const mySeq = currentSeq // 1
    
    const result = applySalesResult({
      data: [{ id: '1', title: 'Sale 1' }],
      seq: mySeq,
      cause: 'Filters' // Compatible with UserPan
    }, 'map')
    
    expect(result).toBe('ok:apply')
    expect(mockApplySalesResult).toHaveBeenCalled()
  })

  it('allows ClusterDrilldown to accept Filters cause', () => {
    bumpSeq({ kind: 'ClusterDrilldown' })
    const mySeq = currentSeq // 1
    
    const result = applySalesResult({
      data: [{ id: '1', title: 'Sale 1' }],
      seq: mySeq,
      cause: 'Filters' // Compatible with ClusterDrilldown
    }, 'map')
    
    expect(result).toBe('ok:apply')
    expect(mockApplySalesResult).toHaveBeenCalled()
  })
})
