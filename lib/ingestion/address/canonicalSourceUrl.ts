/**
 * Canonical listing URL for enrichment dedupe (platform + URL).
 * Aligns with reconciliation URL normalization (sorted query params).
 */

export function canonicalSourceUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  try {
    const u = new URL(trimmed)
    u.hash = ''
    const entries = [...u.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    u.search = ''
    for (const [k, v] of entries) {
      u.searchParams.append(k, v)
    }
    return u.href
  } catch {
    return trimmed
  }
}
