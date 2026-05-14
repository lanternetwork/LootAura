import { parseExternalPageSourceHtml } from '@/lib/ingestion/adapters/externalPageSource'
import type { ExternalPageSourceIngestionConfig } from '@/lib/ingestion/adapters/externalPageSource'

export interface ParsedListingSnapshotForReconciliation {
  readonly title: string
  readonly description: string | null
  readonly imageUrls: readonly string[]
  readonly dateStart: string | null
  readonly dateEnd: string | null
}

export function normalizeListingUrlForReconciliation(url: string): string {
  const raw = url.trim()
  try {
    const u = new URL(raw)
    u.hash = ''
    const entries = [...u.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    u.search = ''
    for (const [k, v] of entries) {
      u.searchParams.append(k, v)
    }
    return u.href
  } catch {
    return raw
  }
}

function buildParseConfig(input: {
  readonly city: string
  readonly state: string
  readonly sourcePlatform: string
}): ExternalPageSourceIngestionConfig {
  return {
    city: input.city,
    state: input.state,
    source_platform: input.sourcePlatform,
    source_pages: [],
  }
}

/**
 * Parse refreshed HTML using the existing external list parser and select the row's listing anchor.
 */
export function tryParseExternalPageListingForReconciliation(input: {
  readonly html: string
  readonly sourceUrl: string
  readonly city: string | null
  readonly state: string | null
  readonly sourcePlatform: string
}): ParsedListingSnapshotForReconciliation | null {
  const city = typeof input.city === 'string' && input.city.trim() ? input.city.trim() : null
  const state = typeof input.state === 'string' && input.state.trim() ? input.state.trim() : null
  if (!city || !state) {
    return null
  }

  const config = buildParseConfig({ city, state, sourcePlatform: input.sourcePlatform })
  const pageUrl = input.sourceUrl
  const { listings } = parseExternalPageSourceHtml(input.html, config, pageUrl)
  const target = normalizeListingUrlForReconciliation(input.sourceUrl)
  const match = listings.find((l) => normalizeListingUrlForReconciliation(l.sourceUrl) === target)
  if (!match) {
    return null
  }

  const raw = match.rawPayload as { imageUrls?: unknown }
  const imageUrls: string[] = []
  if (Array.isArray(raw.imageUrls)) {
    for (const u of raw.imageUrls) {
      if (typeof u === 'string' && u.trim()) imageUrls.push(u.trim())
    }
  }
  if (typeof match.imageSourceUrl === 'string' && match.imageSourceUrl.trim()) {
    const t = match.imageSourceUrl.trim()
    if (!imageUrls.includes(t)) imageUrls.push(t)
  }

  return {
    title: match.title,
    description: match.description,
    imageUrls,
    dateStart: match.startDate ?? null,
    dateEnd: match.endDate ?? null,
  }
}
