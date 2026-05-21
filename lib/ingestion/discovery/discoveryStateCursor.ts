import { getVerifiedStateIndexEntries } from '@/lib/ingestion/discovery/sourceStateIndexCatalog'

/** High-volume states first for Phase 2 source expansion (round-robin still applies within catalog). */
export const YSTM_DISCOVERY_PRIORITY_STATE_CODES = [
  'IL',
  'TX',
  'CA',
  'FL',
  'OH',
  'PA',
  'NY',
  'GA',
  'NC',
  'MI',
] as const

/** Sorted USPS codes for fair nationwide progression; priority states lead the catalog. */
export function listNationwideDiscoveryStateCodes(): string[] {
  const all = getVerifiedStateIndexEntries()
    .map((e) => e.stateCode)
    .sort((a, b) => a.localeCompare(b))
  const prioritySet = new Set<string>(YSTM_DISCOVERY_PRIORITY_STATE_CODES)
  const priority = YSTM_DISCOVERY_PRIORITY_STATE_CODES.filter((code) => all.includes(code))
  const rest = all.filter((code) => !prioritySet.has(code))
  return [...priority, ...rest]
}

export type StateBatchSelection = {
  states: string[]
  nextCursor: number
  catalogSize: number
}

/**
 * Pick the next bounded state batch from the nationwide catalog (round-robin).
 */
export function pickDiscoveryStateBatch(
  cursor: number,
  batchSize: number,
  catalog: string[] = listNationwideDiscoveryStateCodes()
): StateBatchSelection {
  if (catalog.length === 0 || batchSize <= 0) {
    return { states: [], nextCursor: 0, catalogSize: catalog.length }
  }
  const safeCursor = ((cursor % catalog.length) + catalog.length) % catalog.length
  const states: string[] = []
  for (let i = 0; i < Math.min(batchSize, catalog.length); i++) {
    states.push(catalog[(safeCursor + i) % catalog.length]!)
  }
  const nextCursor = (safeCursor + states.length) % catalog.length
  return { states, nextCursor, catalogSize: catalog.length }
}
