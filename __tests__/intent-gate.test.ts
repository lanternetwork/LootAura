import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isCauseCompatibleWithIntent } from '@/lib/sales/intent'
import { deduplicateSales } from '@/lib/sales/dedupe'

// Mock the intent system
const mockSeqRef = { current: 0 }
const mockIntentRef = { current: { kind: 'Idle' as const } }

// Mock applySalesResult function
const createMockApplySalesResult = () => {
  const state = { mapSales: { data: [] }, filteredSales: { data: [] } }
  const setMapSales = vi.fn()
  const setFilteredSales = vi.fn()
  
  const applySalesResult = (
    incoming: { data: any[]; seq: number; cause: string },
    target: 'map' | 'filtered'
  ) => {
    // Parse OK? (we did above)
    if (!Array.isArray(incoming.data)) {
      console.debug('[APPLY] drop invalid', { reason: 'not array', data: typeof incoming.data })
      return
    }

    // Deduplicate before gate
    const unique = deduplicateSales(incoming.data)

    // Gate: apply only if res.seq >= seqRef.current and compatible
    const currentSeq = mockSeqRef.current
    const currentIntent = mockIntentRef.current

    if (incoming.seq < currentSeq) {
      console.debug('[APPLY] drop stale', { incomingSeq: incoming.seq, currentSeq })
      return
    }
    if (!isCauseCompatibleWithIntent(incoming.cause as any, currentIntent)) {
      console.debug('[APPLY] drop incompatible', { cause: incoming.cause, intent: currentIntent.kind })
      return
    }

    // Apply the result
    if (target === 'map') {
      setMapSales({ data: unique, seq: incoming.seq, source: incoming.cause })
    } else {
      setFilteredSales({ data: unique, seq: incoming.seq, source: incoming.cause })
    }
    console.debug('[APPLY] ok', { target, count: unique.length, seq: incoming.seq, cause: incoming.cause })
  }
  
  return { applySalesResult, setMapSales, setFilteredSales, state }
}

describe('Intent Gate Test', () => {
  let mockApply: ReturnType<typeof createMockApplySalesResult>
  
  beforeEach(() => {
    mockApply = createMockApplySalesResult()
    mockSeqRef.current = 0
    mockIntentRef.current = { kind: 'Idle' }
  })

  it('should drop older sequence results', () => {
    const { applySalesResult, setMapSales } = mockApply
    
    // Set current seq to 2
    mockSeqRef.current = 2
    
    // Try to apply seq=1 (older)
    applySalesResult({ data: [{ id: '1', title: 'Sale 1' }], seq: 1, cause: 'Filters' }, 'map')
    
    expect(setMapSales).not.toHaveBeenCalled()
  })

  it('should drop incompatible intent', () => {
    const { applySalesResult, setMapSales } = mockApply
    
    // Set intent to ClusterDrilldown
    mockIntentRef.current = { kind: 'ClusterDrilldown' }
    mockSeqRef.current = 1
    
    // Try to apply Filters cause (incompatible with ClusterDrilldown)
    applySalesResult({ data: [{ id: '1', title: 'Sale 1' }], seq: 1, cause: 'Filters' }, 'map')
    
    expect(setMapSales).not.toHaveBeenCalled()
  })

  it('should apply compatible and newer results', () => {
    const { applySalesResult, setMapSales } = mockApply
    
    // Set intent to Filters
    mockIntentRef.current = { kind: 'Filters' }
    mockSeqRef.current = 1
    
    // Apply compatible result
    applySalesResult({ data: [{ id: '1', title: 'Sale 1' }], seq: 2, cause: 'Filters' }, 'map')
    
    expect(setMapSales).toHaveBeenCalledWith({
      data: [{ id: '1', title: 'Sale 1' }],
      seq: 2,
      source: 'Filters'
    })
  })

  it('should deduplicate sales before applying', () => {
    const { applySalesResult, setMapSales } = mockApply
    
    mockIntentRef.current = { kind: 'Filters' }
    mockSeqRef.current = 1
    
    // Apply with duplicate sales
    const duplicateSales = [
      { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724 },
      { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724 }, // duplicate
      { id: '2', title: 'Sale 2', lat: 38.240, lng: -85.726 }
    ]
    
    applySalesResult({ data: duplicateSales, seq: 2, cause: 'Filters' }, 'map')
    
    expect(setMapSales).toHaveBeenCalledWith({
      data: [
        { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724 },
        { id: '2', title: 'Sale 2', lat: 38.240, lng: -85.726 }
      ],
      seq: 2,
      source: 'Filters'
    })
  })

  it('should handle state updates correctly', () => {
    const { applySalesResult, setMapSales, setFilteredSales } = mockApply
    
    mockIntentRef.current = { kind: 'Filters' }
    mockSeqRef.current = 1
    
    // Apply to map
    applySalesResult({ data: [{ id: '1', title: 'Sale 1' }], seq: 2, cause: 'Filters' }, 'map')
    expect(setMapSales).toHaveBeenCalledTimes(1)
    expect(setFilteredSales).not.toHaveBeenCalled()
    
    // Apply to filtered
    applySalesResult({ data: [{ id: '2', title: 'Sale 2' }], seq: 3, cause: 'Filters' }, 'filtered')
    expect(setFilteredSales).toHaveBeenCalledTimes(1)
    expect(setMapSales).toHaveBeenCalledTimes(1) // Still only 1
  })
})
