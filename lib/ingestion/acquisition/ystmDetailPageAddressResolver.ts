import { extractFallbackAddressAndDates } from '@/lib/ingestion/adapters/externalPageSource'
import { hasStreetNumberAndName } from '@/lib/ingestion/address/addressUsability'
import {
  addressLineFromYstmListingUrlSlug,
  enrichStreetLineWithPathMunicipalityWhenNoTail,
} from '@/lib/ingestion/ystmAddressSlug'

/** Where the winning detail-page address line was resolved (Phase A cascade). */
export type YstmDetailAddressSource =
  | 'detail_dom'
  | 'json_ld'
  | 'script_directions'
  | 'url_slug'
  | 'body_text'

export type YstmDetailAddressResolution = {
  addressRaw: string | null
  addressSource: YstmDetailAddressSource | null
}

const PLACEHOLDER_ADDRESS = /^(?:hidden|tbd|n\/a|na|none|see\s+(?:map|source|details?)|address\s+hidden|contact\s+(?:us|seller))\.?$/i

export function isYstmPlaceholderAddressLine(line: string | null | undefined): boolean {
  const trimmed = line?.replace(/\s+/g, ' ').trim() ?? ''
  if (!trimmed) return true
  if (PLACEHOLDER_ADDRESS.test(trimmed)) return true
  return false
}

export function isPublishableYstmDetailAddressCandidate(line: string | null | undefined): boolean {
  const trimmed = line?.replace(/\s+/g, ' ').trim() ?? ''
  if (!trimmed || isYstmPlaceholderAddressLine(trimmed)) return false
  return hasStreetNumberAndName(trimmed)
}

export function ystmDetailChosenAddressSourceKey(
  addressSource: YstmDetailAddressSource | null | undefined
): string | null {
  if (!addressSource) return null
  return `ystm_detail_${addressSource}`
}

/** Detail page has provider coords but no publishable address line (e.g. #address Hidden). */
export function shouldSuppressListSeedAddressForDetailFirst(detailPage: {
  addressSource: YstmDetailAddressSource | null
  addressRaw: string | null
  nativeCoords: { lat: number; lng: number } | null
}): boolean {
  if (detailPage.addressSource) return false
  if (detailPage.addressRaw?.trim()) return false
  return detailPage.nativeCoords != null
}

export function resolveDetailFirstMergedAddressRaw(
  detailPage: {
    addressSource: YstmDetailAddressSource | null
    addressRaw: string | null
    nativeCoords: { lat: number; lng: number } | null
  },
  listSeed: { addressRaw?: string | null }
): string | null {
  if (detailPage.addressSource && detailPage.addressRaw?.trim()) {
    return detailPage.addressRaw.trim()
  }
  if (shouldSuppressListSeedAddressForDetailFirst(detailPage)) {
    return null
  }
  if (detailPage.addressRaw?.trim()) return detailPage.addressRaw.trim()
  return listSeed.addressRaw?.trim() || null
}

function normalizeAddressLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

function enrichSlugOrLine(line: string, sourceUrl: string): string {
  const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(line.trim(), sourceUrl)
  return enriched.line?.trim() ?? line.trim()
}

export function extractAddressFromDetailDom(document: Document): string | null {
  const addressEl = document.getElementById('address')
  if (!addressEl) return null
  const clone = addressEl.cloneNode(true) as HTMLElement
  for (const el of clone.querySelectorAll('a, br')) {
    el.remove()
  }
  const line = clone.textContent?.replace(/\s+/g, ' ').trim()
  return line && line.length > 0 ? line : null
}

export function extractAddressFromOnClickDirectionsScript(html: string): string | null {
  const match = html.match(/function\s+onClickDirections\s*\(\)\s*\{[\s\S]*?const\s+address\s*=\s*["']([^"']+)["']/i)
  if (!match?.[1]) return null
  return normalizeAddressLine(match[1])
}

type JsonLdNode = Record<string, unknown>

function readJsonLdAddressFromNode(node: JsonLdNode): string | null {
  const location = node.location
  if (!location || typeof location !== 'object') return null
  const loc = location as JsonLdNode
  const address = loc.address
  if (address && typeof address === 'object') {
    const addr = address as JsonLdNode
    const street = typeof addr.streetAddress === 'string' ? addr.streetAddress.trim() : ''
    if (street) return street
  }
  if (typeof loc.name === 'string' && loc.name.trim()) {
    return loc.name.trim()
  }
  return null
}

export function extractAddressFromJsonLd(html: string): string | null {
  const scriptPattern =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = scriptPattern.exec(html)) !== null) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as JsonLdNode | JsonLdNode[]
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        const typeRaw = node['@type']
        const typeList =
          typeof typeRaw === 'string'
            ? [typeRaw]
            : Array.isArray(typeRaw)
              ? typeRaw.map(String)
              : []
        const isEvent =
          typeList.length === 0 || typeList.some((t) => t.toLowerCase() === 'event')
        if (!isEvent) continue
        const line = readJsonLdAddressFromNode(node)
        if (line) return normalizeAddressLine(line)
      }
    } catch {
      continue
    }
  }
  return null
}

function tryCandidate(
  line: string | null | undefined,
  source: YstmDetailAddressSource,
  sourceUrl: string
): YstmDetailAddressResolution | null {
  if (!line?.trim()) return null
  const normalized = normalizeAddressLine(line)
  if (!isPublishableYstmDetailAddressCandidate(normalized)) return null
  const enriched = enrichSlugOrLine(normalized, sourceUrl)
  if (!isPublishableYstmDetailAddressCandidate(enriched)) return null
  return { addressRaw: enriched, addressSource: source }
}

/**
 * Resolve a publishable address from YSTM detail HTML using ordered fallbacks.
 * Rejects placeholder #address text (e.g. "Hidden") and tries script, JSON-LD, slug, body.
 */
export function resolveYstmDetailPageAddress(input: {
  document: Document
  html: string
  sourceUrl: string
  configCity: string
  configState: string
}): YstmDetailAddressResolution {
  const domLine = extractAddressFromDetailDom(input.document)
  const domResult = tryCandidate(domLine, 'detail_dom', input.sourceUrl)
  if (domResult) return domResult

  const jsonLdLine = extractAddressFromJsonLd(input.html)
  const jsonLdResult = tryCandidate(jsonLdLine, 'json_ld', input.sourceUrl)
  if (jsonLdResult) return jsonLdResult

  const scriptLine = extractAddressFromOnClickDirectionsScript(input.html)
  const scriptResult = tryCandidate(scriptLine, 'script_directions', input.sourceUrl)
  if (scriptResult) return scriptResult

  const slugLine = addressLineFromYstmListingUrlSlug(input.sourceUrl)
  const slugResult = tryCandidate(slugLine, 'url_slug', input.sourceUrl)
  if (slugResult) return slugResult

  const fullText = input.document.body?.textContent ?? ''
  const fromBody = extractFallbackAddressAndDates(
    fullText,
    input.configCity,
    input.configState
  )
  const bodyResult = tryCandidate(fromBody.address, 'body_text', input.sourceUrl)
  if (bodyResult) return bodyResult

  return { addressRaw: null, addressSource: null }
}
