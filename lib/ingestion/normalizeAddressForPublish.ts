import { uspsCodeToFullNameForAddress } from '@/lib/ingestion/adapters/usStateListPathSegment'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** City + state (USPS or full name) and optional ZIP already present — do not append again. */
function addressAlreadyContainsCityState(address: string, city: string, state: string): boolean {
  const cityNorm = city.replace(/\s+/g, ' ').trim()
  const stateNorm = state.replace(/\s+/g, ' ').trim()
  if (!cityNorm || !stateNorm) return false

  const cityEsc = escapeRegExp(cityNorm)
  const optionalZip = '(?:\\s+\\d{5}(?:-\\d{4})?)?'
  const statePatterns = [escapeRegExp(stateNorm)]
  if (stateNorm.length === 2) {
    const full = uspsCodeToFullNameForAddress(stateNorm)
    if (full) statePatterns.push(escapeRegExp(full))
  }

  for (const stateEsc of statePatterns) {
    if (new RegExp(`${cityEsc}\\s*,\\s*${stateEsc}${optionalZip}`, 'i').test(address)) {
      return true
    }
  }
  return false
}

/** Normalizes ingested address lines for publish; exported for unit tests and repair jobs. */
export function normalizeAddressForPublish(
  normalizedAddress: string | null,
  city: string,
  state: string
): string | null {
  const base = (normalizedAddress || '').replace(/\s+/g, ' ').trim()
  if (!base) return null

  const cityState = [city, state].map((v) => v.trim()).filter(Boolean).join(', ')
  if (!cityState) return base

  const suffixPattern = new RegExp(`(?:,\\s*${escapeRegExp(cityState)})+$`, 'i')
  const withoutDuplicateSuffix = base.replace(suffixPattern, '').replace(/\s*,\s*$/g, '').trim()

  if (!withoutDuplicateSuffix) return cityState
  if (addressAlreadyContainsCityState(withoutDuplicateSuffix, city, state)) {
    return withoutDuplicateSuffix
  }
  return `${withoutDuplicateSuffix}, ${cityState}`
}
