/** Shared address usability gate (matches processSale / ystm slug enrichment rules). */

export function hasStreetNumberAndName(address: string | null | undefined): boolean {
  if (!address) return false
  return /^\s*\d+\s+.+/.test(address)
}

export function isAddressGeocodeReady(addressRaw: string | null | undefined): boolean {
  const trimmed = addressRaw?.replace(/\s+/g, ' ').trim() ?? ''
  if (!trimmed) return false
  return hasStreetNumberAndName(trimmed)
}

export function normalizeAddressLineForIngest(addressRaw: string | null | undefined): string | null {
  const trimmed = addressRaw?.replace(/\s+/g, ' ').trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}
