/**
 * Cloudinary image fallback for publish — kept out of `publish.ts` so modules
 * imported from instrumentation (e.g. ingestedSalesRepair → normalizeAddressForPublish) do not
 * pull Node-only `externalImageValidation` into the Next client bundle.
 */
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { sanitizeExternalImageUrls } from '@/lib/ingestion/externalImageValidation'
import type { PublishableIngestedSale } from '@/lib/ingestion/publish'

/** Mutates `sale.image_urls` when listing URLs are empty and Cloudinary URL passes sanitizer. */
export async function mergeSanitizedCloudinaryIntoPublishable(sale: PublishableIngestedSale): Promise<void> {
  const urls = sale.image_urls
  if (Array.isArray(urls) && urls.length > 0) return
  const raw = sale.image_cloudinary_url?.trim()
  if (!raw) return
  const sanitized = await sanitizeExternalImageUrls([raw], {
    rowId: sale.id,
    city: sale.city,
    state: sale.state,
    max: MAX_IMPORTED_LISTING_IMAGES,
  })
  if (sanitized.length > 0) {
    sale.image_urls = sanitized
  }
}
