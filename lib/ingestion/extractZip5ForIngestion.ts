/**
 * Extracts a US ZIP5 for ingestion auto-provision timezone + ZIP-locality trust.
 * Prefers the last ZIP-like token on the address line, then scans listing URL path segments.
 */

export function extractLastZip5FromText(text: string | null | undefined): string | null {
  if (text == null) return null
  const matches = [...String(text).matchAll(/\b(\d{5})(?:-\d{4})?\b/g)]
  if (matches.length === 0) return null
  const last = matches[matches.length - 1]
  const z = last?.[1]
  return z && /^\d{5}$/.test(z) ? z : null
}

export function extractZip5FromListingUrlPath(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const seg = parts[i]
      const m = seg?.match(/^(\d{5})$/)
      if (m?.[1]) return m[1]
    }
  } catch {
    // ignore
  }
  return null
}

export function extractZip5ForIngestionContext(args: {
  resolvedAddressRaw: string | null | undefined
  sourceUrl: string
}): string | null {
  const fromAddr = extractLastZip5FromText(args.resolvedAddressRaw ?? null)
  if (fromAddr) return fromAddr
  return extractZip5FromListingUrlPath(args.sourceUrl)
}
