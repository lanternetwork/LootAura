import { JSDOM } from 'jsdom'
import { extractYstmDetailMediaStrFromHtml } from '@/lib/ingestion/images/extractYstmDetailMediaStr'
import { extractYstmDetailSaleHoursFromText } from '@/lib/ingestion/saleHourRangeFromText'
import {
  resolveYstmDetailPageAddress,
  type YstmDetailAddressSource,
} from '@/lib/ingestion/acquisition/ystmDetailPageAddressResolver'
import {
  extractYstmNativeCoordinatesFromHtml,
  type YstmNativeCoordinates,
} from '@/lib/ingestion/spatial/extractYstmNativeCoordinates'
import { resolveYstmListingCityAuthority } from '@/lib/ingestion/ystmListingCityAuthority'
import { extractFallbackAddressAndDates } from '@/lib/ingestion/adapters/externalPageSource'

export type { YstmDetailAddressSource } from '@/lib/ingestion/acquisition/ystmDetailPageAddressResolver'

export type YstmDetailPageParsed = {
  title: string | null
  description: string | null
  addressRaw: string | null
  /** Phase A: which cascade step produced addressRaw (null when gated/placeholder-only). */
  addressSource: YstmDetailAddressSource | null
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

  const title = extractTitleFromDetailDocument(document)
  const description = extractDescriptionFromDetailDocument(document)
  const fullText = document.body?.textContent ?? ''

  const { addressRaw, addressSource } = resolveYstmDetailPageAddress({
    document,
    html,
    sourceUrl: input.sourceUrl,
    configCity: cityHint,
    configState: stateHint,
  })

  const authority = resolveYstmListingCityAuthority(input.sourceUrl, addressRaw)
  const city = authority.resolvedCity ?? cityHint
  const state = authority.resolvedState ?? stateHint

  const fromBody = extractFallbackAddressAndDates(fullText, cityHint, stateHint)
  const startDate = fromBody.start
  const endDate = fromBody.end

  const media = extractYstmDetailMediaStrFromHtml(html, input.sourceUrl)
  const nativeCoords = extractYstmNativeCoordinatesFromHtml(html)

  const hourSource = [description, title, addressRaw].filter(Boolean).join('\n')
  const hourRange = extractYstmDetailSaleHoursFromText(hourSource)

  if (!title?.trim() && !addressRaw?.trim() && !nativeCoords) {
    return null
  }

  return {
    title,
    description,
    addressRaw,
    addressSource,
    startDate,
    endDate,
    city,
    state,
    imageUrls: media.imageUrls,
    nativeCoords,
    cityConflict: authority.cityConflict,
    detailTimeStart: hourRange?.timeStart,
    detailTimeEnd: hourRange?.timeEnd ?? undefined,
  }
}
