/**
 * Server-side mirror of the browser extension ZIP locality fixture used for
 * `zip_locality_authority` trust + tests. Keep fixture rows aligned with
 * `browser-extension/zipLocalityResolver.js` when that list changes.
 *
 * `source_pages` on `ingestion_city_configs` remains optional crawl metadata;
 * this module is only for fail-closed primary-ZIP locality matching.
 */

export type ZipLocalityPrimaryRejectionReason =
  | 'invalid_zip'
  | 'unknown_zip'
  | 'state_mismatch'
  | 'ambiguous_zip_locality'

export type ZipLocalityPrimaryResult = {
  city: string
  state: string
  source: 'zip_locality_authority'
  confidence: 'primary_zip_match'
}

const ZIP_LOCALITY_FIXTURE: Record<string, Array<{ city: string; state: string; primary: boolean }>> = {
  '46319': [{ city: 'Griffith', state: 'IN', primary: true }],
  '60601': [
    { city: 'Chicago', state: 'IL', primary: false },
    { city: 'Near North Side', state: 'IL', primary: false },
  ],
}

function normalizeZip5(input: string | null | undefined): string | null {
  if (input == null) return null
  const m = String(input).trim().match(/^(\d{5})(?:-\d{4})?$/)
  return m ? m[1]! : null
}

function normalizeExpectedState(input: string | null | undefined): string | undefined {
  if (input == null) return undefined
  const s = String(input).trim().toUpperCase()
  return /^[A-Z]{2}$/.test(s) ? s : undefined
}

export function resolveZipLocalityPrimaryWithDiagnostics(input: {
  zip: string | null | undefined
  expectedState?: string | null | undefined
}): {
  zip: string | null
  expectedState: string | null
  result: ZipLocalityPrimaryResult | null
  rejectionReason: ZipLocalityPrimaryRejectionReason | null
} {
  const zip5 = normalizeZip5(input.zip)
  const expectedState = normalizeExpectedState(input.expectedState) ?? null
  if (!zip5) {
    return { zip: null, expectedState, result: null, rejectionReason: 'invalid_zip' }
  }

  const all = ZIP_LOCALITY_FIXTURE[zip5]
  if (!Array.isArray(all) || all.length === 0) {
    return { zip: zip5, expectedState, result: null, rejectionReason: 'unknown_zip' }
  }

  const stateScoped = expectedState
    ? all.filter((row) => String(row.state || '').toUpperCase() === expectedState)
    : all.slice()

  if (expectedState && stateScoped.length === 0) {
    return { zip: zip5, expectedState, result: null, rejectionReason: 'state_mismatch' }
  }

  const primary = stateScoped.filter((row) => Boolean(row && row.primary === true))
  if (primary.length !== 1) {
    return { zip: zip5, expectedState, result: null, rejectionReason: 'ambiguous_zip_locality' }
  }

  return {
    zip: zip5,
    expectedState,
    result: {
      city: String(primary[0]!.city || '').trim(),
      state: String(primary[0]!.state || '').toUpperCase(),
      source: 'zip_locality_authority',
      confidence: 'primary_zip_match',
    },
    rejectionReason: null,
  }
}
