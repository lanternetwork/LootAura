import { JSDOM } from 'jsdom'
import type {
  ExternalPageSourceIngestionConfig,
  ExternalPageSourceListing,
  ParseExternalPageSourceResult,
} from '@/lib/ingestion/adapters/externalPageSourceTypes'
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { buildEsnetCanonicalDetailUrl } from '@/lib/ingestion/estatesalesnet/esnetHosts'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'
import { extractEsnetNgrxStateFromDocument } from '@/lib/ingestion/estatesalesnet/esnetNgrxState'
import { logger } from '@/lib/log'

type EsnetSaleRow = {
  id?: number | string
  name?: string
  orgName?: string
  address?: string
  latitude?: number
  longitude?: number
  postalCodeNumber?: string | number
  stateCode?: string
  cityName?: string
  dates?: Array<{ utcStart?: string; utcEnd?: string; start?: string; end?: string }>
  type?: number
  typeName?: string
  pictureCount?: number
  mainPicture?: { url?: string; thumbnailUrl?: string } | string
  utcShowAddressAfter?: string | null
  auctionUrl?: string | null
}

function readMainPictureUrl(mainPicture: EsnetSaleRow['mainPicture']): string | null {
  if (!mainPicture) return null
  if (typeof mainPicture === 'string') return mainPicture.trim() || null
  const url = mainPicture.url ?? mainPicture.thumbnailUrl
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

function dateRangeFromRow(dates: EsnetSaleRow['dates']): { start?: string; end?: string } {
  if (!Array.isArray(dates) || dates.length === 0) return {}
  const isoDays: string[] = []
  for (const d of dates) {
    const raw = d.utcStart ?? d.start ?? d.utcEnd ?? d.end
    if (typeof raw !== 'string' || !raw.trim()) continue
    const day = raw.trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) isoDays.push(day)
  }
  if (isoDays.length === 0) return {}
  isoDays.sort()
  return { start: isoDays[0], end: isoDays[isoDays.length - 1] }
}

function saleRowsFromNgrx(root: Record<string, unknown>): Record<string, EsnetSaleRow> | null {
  const ngrx = root.NGRX_STATE as Record<string, unknown> | undefined
  const sales = ngrx?.sales as Record<string, unknown> | undefined
  const rows = sales?.saleRows
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return null
  return rows as Record<string, EsnetSaleRow>
}

function citySlugFromPageUrl(pageUrl: string, fallbackCity: string): string {
  try {
    const parts = new URL(pageUrl).pathname.split('/').filter(Boolean)
    if (parts.length >= 2) return parts[1] ?? fallbackCity
  } catch {
    /* ignore */
  }
  return fallbackCity
}

function normalizeHttpsImage(url: string | null, pageUrl: string): string | null {
  if (!url?.trim()) return null
  try {
    const resolved = new URL(url.trim(), pageUrl)
    if (resolved.protocol !== 'https:') return null
    return resolved.href
  } catch {
    return null
  }
}

export function parseEsnetNgrxListHtml(
  html: string,
  config: ExternalPageSourceIngestionConfig,
  pageUrl: string
): ParseExternalPageSourceResult {
  const normalizedHtml = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const dom = new JSDOM(normalizedHtml, { url: pageUrl })
  const { document } = dom.window

  const root = extractEsnetNgrxStateFromDocument(document)
  if (!root) {
    logger.warn('ES.net list parse: NGRX_STATE missing', {
      component: 'ingestion/estatesalesnet/parseEsnetNgrxListHtml',
      operation: 'parse',
      city: config.city,
      state: config.state,
    })
    return { listings: [], invalid: 0 }
  }

  const saleRows = saleRowsFromNgrx(root)
  if (!saleRows) {
    return { listings: [], invalid: 0 }
  }

  const citySlug = citySlugFromPageUrl(pageUrl, config.city)
  const listings: ExternalPageSourceListing[] = []
  let invalid = 0

  for (const [key, row] of Object.entries(saleRows)) {
    const saleId = String(row.id ?? key).trim()
    if (!/^\d+$/.test(saleId)) {
      invalid += 1
      continue
    }

    const title = (row.name ?? '').replace(/\s+/g, ' ').trim()
    if (!title) {
      invalid += 1
      continue
    }

    const state = (row.stateCode ?? config.state ?? '').trim().toUpperCase()
    const postalCode = String(row.postalCodeNumber ?? '').trim()
    if (!state || !postalCode) {
      invalid += 1
      continue
    }

    const { start: startDate, end: endDate } = dateRangeFromRow(row.dates)
    if (!startDate) {
      invalid += 1
      continue
    }

    const addressRaw = (row.address ?? '').replace(/\s+/g, ' ').trim() || null
    const mainImageUrl = normalizeHttpsImage(readMainPictureUrl(row.mainPicture), pageUrl)
    const imageUrls = mainImageUrl ? [mainImageUrl] : []

    const sourceUrl = buildEsnetCanonicalDetailUrl({
      stateCode: state,
      citySlug: row.cityName?.trim() || citySlug,
      postalCode,
      saleId,
    })

    const rawPayload: Record<string, unknown> = {
      schemaVersion: 1,
      sourcePlatform: ESNET_SOURCE_PLATFORM,
      esnetSaleId: Number(saleId),
      orgName: row.orgName ?? null,
      saleType: row.type ?? null,
      saleTypeName: row.typeName ?? null,
      postalCode,
      utcShowAddressAfter: row.utcShowAddressAfter ?? null,
      pictureCount: row.pictureCount ?? null,
      auctionUrl: row.auctionUrl ?? null,
      imageUrls: imageUrls.slice(0, MAX_IMPORTED_LISTING_IMAGES),
      esnetNativeLat: typeof row.latitude === 'number' ? row.latitude : null,
      esnetNativeLng: typeof row.longitude === 'number' ? row.longitude : null,
      listPageUrl: pageUrl,
      externalId: saleId,
    }

    listings.push({
      title,
      description: null,
      addressRaw,
      city: config.city,
      state,
      startDate,
      endDate: endDate ?? startDate,
      sourceUrl,
      imageSourceUrl: mainImageUrl,
      rawPayload,
    })
  }

  return { listings, invalid }
}
