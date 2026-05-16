import { getVerifiedStateIndexEntries } from '@/lib/ingestion/discovery/sourceStateIndexCatalog'

/** Sorted USPS codes for fair nationwide progression. */
export function listNationwideDiscoveryStateCodes(): string[] {
  return getVerifiedStateIndexEntries()
    .map((e) => e.stateCode)
    .sort((a, b) => a.localeCompare(b))
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
