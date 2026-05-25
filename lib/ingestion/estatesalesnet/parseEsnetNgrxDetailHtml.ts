import type { ExternalPageSourceIngestionConfig } from '@/lib/ingestion/adapters/externalPageSourceTypes'
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'
import { extractEsnetSourceListingId } from '@/lib/ingestion/estatesalesnet/esnetSourceListingId'
import { htmlDescriptionToPlainText } from '@/lib/ingestion/estatesalesnet/esnetHtmlText'
import {
  extractEsnetNgrxStateFromHtml,
  isoDayFromEsnetNgrxDateTime,
  readEsnetNgrxDateTimeValue,
} from '@/lib/ingestion/estatesalesnet/esnetNgrxState'
import { logger } from '@/lib/log'

type EsnetDetailPicture = {
  pictureOrder?: number
  url?: string
  thumbnailUrl?: string
}

type EsnetDetailEntity = {
  saleId?: number | string
  name?: string
  htmlDescription?: string
  pictureCount?: number
  latitude?: number | null
  longitude?: number | null
  utcShowAddressAfter?: unknown
  firstUtcStartDate?: unknown
  lastUtcEndDate?: unknown
  locationInfo?: {
    address?: {
      name?: string
      addressLine1?: string
      addressLine2?: string
      postalCode?: { cityName?: string; stateCode?: string; postalCodeNumber?: string }
    }
    utcShowAddressAfter?: unknown
    showAddress?: boolean
  }
  pictures?: EsnetDetailPicture[]
  mainPicture?: EsnetDetailPicture | string
}

export type EsnetDetailParsed = {
  saleId: string
  title: string
  description: string | null
  addressRaw: string | null
  city: string
  state: string
  postalCode: string | null
  startDate: string
  endDate: string
  imageUrls: string[]
  utcShowAddressAfter: string | null
  nativeLat: number | null
  nativeLng: number | null
}

function addressFromLocationInfo(entity: EsnetDetailEntity): string | null {
  const addr = entity.locationInfo?.address
  if (!addr) return null
  const parts = [addr.addressLine1, addr.addressLine2, addr.name]
    .map((p) => (typeof p === 'string' ? p.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
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

function collectDetailImageUrls(entity: EsnetDetailEntity, pageUrl: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string | null | undefined) => {
    const normalized = normalizeHttpsImage(raw ?? null, pageUrl)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  }

  const pictures = Array.isArray(entity.pictures) ? [...entity.pictures] : []
  pictures.sort((a, b) => (a.pictureOrder ?? 0) - (b.pictureOrder ?? 0))
  for (const pic of pictures) {
    push(pic.url ?? pic.thumbnailUrl)
  }
  if (out.length === 0 && entity.mainPicture && typeof entity.mainPicture === 'object') {
    push(entity.mainPicture.url ?? entity.mainPicture.thumbnailUrl)
  }

  return out.slice(0, MAX_IMPORTED_LISTING_IMAGES)
}

function detailEntityFromNgrx(
  root: Record<string, unknown>,
  saleId: string
): EsnetDetailEntity | null {
  const ngrx = root.NGRX_STATE as Record<string, unknown> | undefined
  const feature = ngrx?.feature as Record<string, unknown> | undefined
  const view = feature?.traditionalSaleViewState as Record<string, unknown> | undefined
  const byId = view?.entitiesById as Record<string, EsnetDetailEntity> | undefined
  if (!byId) return null
  return byId[saleId] ?? byId[String(Number(saleId))] ?? null
}

export function parseEsnetNgrxDetailHtml(
  html: string,
  sourceUrl: string,
  config: ExternalPageSourceIngestionConfig
): EsnetDetailParsed | null {
  const saleId = extractEsnetSourceListingId(sourceUrl)
  if (!saleId) return null

  const root = extractEsnetNgrxStateFromHtml(html, sourceUrl)
  if (!root) {
    logger.warn('ES.net detail parse: NGRX_STATE missing', {
      component: 'ingestion/estatesalesnet/parseEsnetNgrxDetailHtml',
      operation: 'parse',
      city: config.city,
      state: config.state,
    })
    return null
  }

  const entity = detailEntityFromNgrx(root, saleId)
  if (!entity) return null

  const title = (entity.name ?? '').replace(/\s+/g, ' ').trim()
  if (!title) return null

  const startDate = isoDayFromEsnetNgrxDateTime(entity.firstUtcStartDate)
  if (!startDate) return null
  const endDate = isoDayFromEsnetNgrxDateTime(entity.lastUtcEndDate) ?? startDate

  const postal =
    entity.locationInfo?.address?.postalCode?.postalCodeNumber != null
      ? String(entity.locationInfo.address.postalCode.postalCodeNumber).trim()
      : null
  const state =
    (entity.locationInfo?.address?.postalCode?.stateCode ?? config.state ?? '').trim().toUpperCase() ||
    config.state.trim().toUpperCase()
  const city =
    (entity.locationInfo?.address?.postalCode?.cityName ?? config.city ?? '').trim() || config.city

  const addressRaw = addressFromLocationInfo(entity)

  const utcShowAddressAfter =
    readEsnetNgrxDateTimeValue(entity.utcShowAddressAfter) ??
    readEsnetNgrxDateTimeValue(entity.locationInfo?.utcShowAddressAfter)

  const lat = typeof entity.latitude === 'number' && Number.isFinite(entity.latitude) ? entity.latitude : null
  const lng = typeof entity.longitude === 'number' && Number.isFinite(entity.longitude) ? entity.longitude : null

  return {
    saleId,
    title,
    description: htmlDescriptionToPlainText(entity.htmlDescription),
    addressRaw: addressRaw?.trim() ? addressRaw : null,
    city,
    state,
    postalCode: postal,
    startDate,
    endDate,
    imageUrls: collectDetailImageUrls(entity, sourceUrl),
    utcShowAddressAfter,
    nativeLat: lat,
    nativeLng: lng,
  }
}

export function esnetDetailRawPayloadFields(detail: EsnetDetailParsed): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourcePlatform: ESNET_SOURCE_PLATFORM,
    esnetSaleId: Number(detail.saleId),
    externalId: detail.saleId,
    detailPageParsed: true,
    postalCode: detail.postalCode,
    utcShowAddressAfter: detail.utcShowAddressAfter,
    pictureCount: detail.imageUrls.length,
    imageUrls: detail.imageUrls,
    esnetNativeLat: detail.nativeLat,
    esnetNativeLng: detail.nativeLng,
  }
}
