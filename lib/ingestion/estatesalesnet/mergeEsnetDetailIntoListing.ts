import type { ExternalPageSourceListing } from '@/lib/ingestion/adapters/externalPageSourceTypes'
import type { EsnetDetailParsed } from '@/lib/ingestion/estatesalesnet/parseEsnetNgrxDetailHtml'
import { esnetDetailRawPayloadFields } from '@/lib/ingestion/estatesalesnet/parseEsnetNgrxDetailHtml'

/**
 * Merge SSR detail NGRX fields over list seed. List wins for address when detail has none (gated).
 */
export function mergeEsnetDetailIntoListing(
  listSeed: ExternalPageSourceListing,
  detail: EsnetDetailParsed
): ExternalPageSourceListing {
  const imageUrls = detail.imageUrls.length > 0 ? detail.imageUrls : listSeed.rawPayload.imageUrls
  const mergedImages = Array.isArray(imageUrls)
    ? (imageUrls as string[]).filter((u) => typeof u === 'string')
    : listSeed.imageSourceUrl
      ? [listSeed.imageSourceUrl]
      : []

  const mainImage = mergedImages[0] ?? listSeed.imageSourceUrl

  return {
    title: detail.title || listSeed.title,
    description: detail.description ?? listSeed.description,
    addressRaw: detail.addressRaw?.trim() ? detail.addressRaw : listSeed.addressRaw,
    city: detail.city || listSeed.city,
    state: detail.state || listSeed.state,
    startDate: detail.startDate || listSeed.startDate,
    endDate: detail.endDate || listSeed.endDate,
    sourceUrl: listSeed.sourceUrl,
    imageSourceUrl: mainImage,
    rawPayload: {
      ...listSeed.rawPayload,
      ...esnetDetailRawPayloadFields(detail),
      listPageUrl: listSeed.rawPayload.listPageUrl ?? null,
      orgName: listSeed.rawPayload.orgName ?? null,
      saleTypeName: listSeed.rawPayload.saleTypeName ?? null,
    },
  }
}
