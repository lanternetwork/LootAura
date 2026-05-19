import { JSDOM } from 'jsdom'
import { extractFallbackAddressAndDates } from '@/lib/ingestion/adapters/externalPageSource'
import { extractYstmDetailMediaStrFromHtml } from '@/lib/ingestion/images/extractYstmDetailMediaStr'
import { extractAuthoritativeSaleHourRangeFromText } from '@/lib/ingestion/saleHourRangeFromText'
import {
  extractYstmNativeCoordinatesFromHtml,
  type YstmNativeCoordinates,
} from '@/lib/ingestion/spatial/extractYstmNativeCoordinates'
import { enrichStreetLineWithPathMunicipalityWhenNoTail } from '@/lib/ingestion/ystmAddressSlug'
import { resolveYstmListingCityAuthority } from '@/lib/ingestion/ystmListingCityAuthority'

export type YstmDetailPageParsed = {
  title: string | null
  description: string | null
  addressRaw: string | null
  startDate?: string
  endDate?: string
  city: string | null
  state: string | null
  imageUrls: string[]
  nativeCoords: YstmNativeCoordinates | null
  cityConflict: boolean
  detailTimeStart?: string
  detailTimeEnd?: string
}

function normalizeDetailHtml(html: string): string {
  return html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function extractTitleFromDetailDocument(document: Document): string | null {
  const h1 = document.querySelector('.listing h1') ?? document.querySelector('h1')
  if (!h1) return null
  const clone = h1.cloneNode(true) as HTMLElement
  for (const el of clone.querySelectorAll('#star_button, .star_button')) {
    el.remove()
  }
  const title = clone.textContent?.replace(/\s+/g, ' ').trim()
  return title && title.length > 0 ? title : null
}

function extractAddressFromDetailDocument(document: Document): string | null {
  const addressEl = document.getElementById('address')
  if (!addressEl) return null
  const clone = addressEl.cloneNode(true) as HTMLElement
  for (const el of clone.querySelectorAll('a, br')) {
    el.remove()
  }
  const line = clone.textContent?.replace(/\s+/g, ' ').trim()
  return line && line.length > 0 ? line : null
}

function extractDescriptionFromDetailDocument(document: Document): string | null {
  const addressEl = document.getElementById('address')
  const contentBlock =
    addressEl?.closest('.content') ??
    document.querySelector('.listing .content[style*="margin-top"]') ??
    document.querySelector('.listing .content')

  if (!contentBlock) {
    const body = document.body?.textContent?.replace(/\s+/g, ' ').trim()
    return body && body.length > 40 ? body : null
  }

  const clone = contentBlock.cloneNode(true) as HTMLElement
  for (const el of clone.querySelectorAll('#address, #attribution, a')) {
    el.remove()
  }
  const text = clone.textContent?.replace(/\s+/g, ' ').trim()
  return text && text.length > 20 ? text : null
}

/**
 * Parse a YSTM detail/listing HTML page (`userlisting.html`, `listing.html`) as the
 * authoritative source for title, address, dates, description, images, and native coords.
 */
export function parseYstmDetailPageFromHtml(input: {
  html: string
  sourceUrl: string
  configCity: string
  configState: string
}): YstmDetailPageParsed | null {
  const html = normalizeDetailHtml(input.html)
  if (!html.trim()) return null

  const cityHint = input.configCity?.trim() ?? ''
  const stateHint = input.configState?.trim() ?? ''
  if (!cityHint || !stateHint) return null

  const dom = new JSDOM(html, { url: input.sourceUrl })
  const { document } = dom.window

  let addressRaw = extractAddressFromDetailDocument(document)
  const title = extractTitleFromDetailDocument(document)
  const description = extractDescriptionFromDetailDocument(document)

  const fullText = document.body?.textContent ?? ''
  const fromBody = extractFallbackAddressAndDates(fullText, cityHint, stateHint)
  if (!addressRaw?.trim() && fromBody.address?.trim()) {
    addressRaw = fromBody.address.trim()
  }

  if (addressRaw?.trim()) {
    const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(addressRaw.trim(), input.sourceUrl)
    addressRaw = enriched.line
  }

  const authority = resolveYstmListingCityAuthority(input.sourceUrl, addressRaw)
  const city = authority.resolvedCity ?? cityHint
  const state = authority.resolvedState ?? stateHint

  const startDate = fromBody.start
  const endDate = fromBody.end

  const media = extractYstmDetailMediaStrFromHtml(html, input.sourceUrl)
  const nativeCoords = extractYstmNativeCoordinatesFromHtml(html)

  const hourSource = [description, title, addressRaw, fullText].filter(Boolean).join('\n')
  const hourRange = extractAuthoritativeSaleHourRangeFromText(hourSource)

  if (!title?.trim() && !addressRaw?.trim()) {
    return null
  }

  return {
    title,
    description,
    addressRaw,
    startDate,
    endDate,
    city,
    state,
    imageUrls: media.imageUrls,
    nativeCoords,
    cityConflict: authority.cityConflict,
    detailTimeStart: hourRange?.timeStart,
    detailTimeEnd: hourRange?.timeEnd,
  }
}
