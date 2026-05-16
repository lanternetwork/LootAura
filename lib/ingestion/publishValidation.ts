/**
 * Publish-time validation for ingested rows. Fails closed on placeholder or unresolved addresses.
 */

export class InsufficientAddressForPublishError extends Error {
  constructor(message = 'Cannot publish: address is missing or insufficient') {
    super(message)
    this.name = 'InsufficientAddressForPublishError'
  }
}

const PLACEHOLDER_LINE = new RegExp(
  [
    String.raw`\bunknown\s+address\b`,
    String.raw`\baddress\s+unknown\b`,
    String.raw`\baddress\s+pending\b`,
    String.raw`\bpending\s+address\b`,
    String.raw`\bto\s+be\s+determined\b`,
    String.raw`\bt\.?\s*b\.?\s*d\.?\b`,
    String.raw`\bn/?a\b`,
    String.raw`\bnone\b`,
    String.raw`\bnull\b`,
    String.raw`\bno\s+address\b`,
    String.raw`\bnot\s+available\b`,
    String.raw`\bunspecified\b`,
    String.raw`\bplaceholder\b`,
  ].join('|'),
  'i'
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** First segment of a comma-separated postal line (street / PO box / intersection). */
function firstAddressSegment(fullLine: string): string {
  const part = fullLine.split(',')[0]?.trim() ?? ''
  return part
}

function looksLikeStreetOrLocationDetail(segment: string): boolean {
  if (!segment) return false
  if (PLACEHOLDER_LINE.test(segment)) return false
  if (/\d/.test(segment)) return true
  if (/^P\.?O\.?\s*Box\b/i.test(segment)) return true
  if (/\bRR\s+\d|\bRural\s+Route\b/i.test(segment)) return true
  if (/\b(?:Hwy|Highway|Route|Rt\.?)\s*\d/i.test(segment)) return true
  if (/\bLot\s+\d/i.test(segment)) return true
  if (/\b(?:Unit|Suite|Apt|Ste)\.?\s*[A-Za-z0-9-]+/i.test(segment)) return true
  if (/\b\w+(?:\s+\w+)?\s+&\s+\w+(?:\s+\w+)?\b/i.test(segment)) return true
  return false
}

/** True when the full normalized line is only city + state (+ optional ZIP), no street. */
function isGeographicLineOnly(address: string, city: string, state: string): boolean {
  const cityT = city.trim()
  const stateT = state.trim()
  if (!cityT || !stateT) return false
  const z = escapeRegExp(cityT)
  const s = escapeRegExp(stateT)
  const geoOnly = new RegExp(
    `^\\s*${z}\\s*,\\s*${s}(?:\\s+\\d{5}(?:-\\d{4})?)?\\s*$`,
    'i'
  )
  return geoOnly.test(address)
}

/**
 * Ensures we never publish placeholder or city-only “addresses”.
 * Call after `normalizeAddressForPublish` + schema parse.
 */
export function validateResolvedAddressForPublish(address: string | null, city: string, state: string): void {
  if (address == null || !String(address).trim()) {
    throw new InsufficientAddressForPublishError('Missing address line')
  }
  const line = String(address).replace(/\s+/g, ' ').trim()

  if (PLACEHOLDER_LINE.test(line)) {
    throw new InsufficientAddressForPublishError('Address is a placeholder or unresolved label')
  }

  if (isGeographicLineOnly(line, city, state)) {
    throw new InsufficientAddressForPublishError('Address line is only city and state; street detail required')
  }

  const head = firstAddressSegment(line)
  if (!looksLikeStreetOrLocationDetail(head)) {
    throw new InsufficientAddressForPublishError('Address line lacks a resolvable street or location detail')
  }
}
