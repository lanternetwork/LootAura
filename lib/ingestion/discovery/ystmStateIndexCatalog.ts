import { resolveUsListStatePathSegment } from '@/lib/ingestion/adapters/usStateListPathSegment'
import { normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'

export const YSTM_ORIGIN = 'https://yardsaletreasuremap.com'

export type YstmStateIndexEntry = {
  stateCode: string
  statePathSegment: string
  /** Verified crawl entrypoint: directory index with city `.html` links (not `{State}.html` shell). */
  indexUrl: string
}

/**
 * Verified from live probes (2026-05): `/US/{State}/` lists `Yard Sales near {City}` links;
 * `/US/{State}.html` is an empty shell with no city links.
 */
export function buildYstmStateDirectoryIndexUrl(statePathSegment: string): string {
  const seg = statePathSegment.replace(/^\/+|\/+$/g, '')
  return `${YSTM_ORIGIN}/US/${seg}/`
}

export function getVerifiedYstmStateIndexEntries(stateCodes?: string[]): YstmStateIndexEntry[] {
  const codes =
    stateCodes && stateCodes.length > 0
      ? stateCodes.map((s) => normalizeIngestionState(s)).filter((s): s is string => Boolean(s))
      : Object.keys(USPS_CODES_FOR_CATALOG)

  const out: YstmStateIndexEntry[] = []
  for (const stateCode of codes) {
    const statePathSegment = resolveUsListStatePathSegment(stateCode)
    if (!statePathSegment) continue
    out.push({
      stateCode,
      statePathSegment,
      indexUrl: buildYstmStateDirectoryIndexUrl(statePathSegment),
    })
  }
  return out.sort((a, b) => a.stateCode.localeCompare(b.stateCode))
}

/** USPS codes included in default nationwide catalog (matches ingestion state path map). */
const USPS_CODES_FOR_CATALOG: Record<string, true> = {
  AL: true,
  AK: true,
  AZ: true,
  AR: true,
  CA: true,
  CO: true,
  CT: true,
  DE: true,
  DC: true,
  FL: true,
  GA: true,
  HI: true,
  ID: true,
  IL: true,
  IN: true,
  IA: true,
  KS: true,
  KY: true,
  LA: true,
  ME: true,
  MD: true,
  MA: true,
  MI: true,
  MN: true,
  MS: true,
  MO: true,
  MT: true,
  NE: true,
  NV: true,
  NH: true,
  NJ: true,
  NM: true,
  NY: true,
  NC: true,
  ND: true,
  OH: true,
  OK: true,
  OR: true,
  PA: true,
  RI: true,
  SC: true,
  SD: true,
  TN: true,
  TX: true,
  UT: true,
  VT: true,
  VA: true,
  WA: true,
  WV: true,
  WI: true,
  WY: true,
}
