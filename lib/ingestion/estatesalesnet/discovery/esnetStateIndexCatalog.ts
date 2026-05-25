import { getVerifiedStateIndexEntries } from '@/lib/ingestion/discovery/sourceStateIndexCatalog'

export const ESNET_LIST_ORIGIN = 'https://www.estatesales.net'

export type EsnetStateIndexEntry = {
  stateCode: string
  indexUrl: string
}

export function buildEsnetStateIndexUrl(stateCode: string): string {
  return `${ESNET_LIST_ORIGIN}/${stateCode.trim().toUpperCase()}`
}

export function getEsnetStateIndexEntries(stateCodes?: string[]): EsnetStateIndexEntry[] {
  return getVerifiedStateIndexEntries(stateCodes).map((entry) => ({
    stateCode: entry.stateCode,
    indexUrl: buildEsnetStateIndexUrl(entry.stateCode),
  }))
}
