import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { FIXED_INGEST_OWNER_ID } from '@/lib/ingestion/fixedIngestOwnerId'
import { PublishInputSchema } from '@/lib/ingestion/schemas'
import type { PublishInput } from '@/lib/ingestion/types'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'
import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import {
  capAddressForPublishSchema,
  roundTimeToNearest30Minutes,
} from '@/lib/ingestion/publishPreflight'
import { resolvePersistableSaleEndsAt } from '@/lib/sales/resolvePersistableSaleEndsAt'

export { normalizeAddressForPublish }
export { capAddressForPublishSchema, roundTimeToNearest30Minutes } from '@/lib/ingestion/publishPreflight'

export interface PublishableIngestedSale {
  id: string
  owner_id?: string | null
  source_platform: string
  source_url: string
  title: string | null
  description: string | null
  normalized_address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  lat: number
  lng: number
  date_start: string
  date_end: string | null
  time_start: string | null
  time_end: string | null
  image_cloudinary_url: string | null
  image_urls?: string[] | null
}

function normalizePublishInput(ingestedSale: PublishableIngestedSale): PublishInput {
  const ownerId = ingestedSale.owner_id?.trim() || FIXED_INGEST_OWNER_ID
  const title = (ingestedSale.title || '').trim() || `${ingestedSale.city || 'Unknown'} Yard Sale`
  const city = (ingestedSale.city || '').trim()
  const state = (ingestedSale.state || '').trim()
  const normalizedAddress = capAddressForPublishSchema(
    normalizeAddressForPublish(ingestedSale.normalized_address, city, state)
  )
  const address = normalizedAddress
  const timeStart =
    roundTimeToNearest30Minutes(ingestedSale.time_start) ?? ingestedSale.time_start || '09:00:00'
  const timeEnd = roundTimeToNearest30Minutes(ingestedSale.time_end)
  const normalizedImages = Array.isArray(ingestedSale.image_urls)
    ? ingestedSale.image_urls
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    : []
  /** Cloudinary fallback is merged in `mergeSanitizedCloudinaryIntoPublishable` (publish worker) only. */
  const coverImageUrl = normalizedImages[0] || null
  const images = normalizedImages

  return {
    ownerId,
    title,
    description: ingestedSale.description?.trim() || null,
    address,
    city,
    state,
    zipCode: ingestedSale.zip_code?.trim() || null,
    lat: ingestedSale.lat,
    lng: ingestedSale.lng,
    dateStart: ingestedSale.date_start,
    dateEnd: ingestedSale.date_end,
    timeStart,
    timeEnd,
    coverImageUrl,
    images,
    importSource: ingestedSale.source_platform,
    externalSourceUrl: ingestedSale.source_url,
    ingestedSaleId: ingestedSale.id,
  }
}

export async function createPublishedSale(ingestedSale: PublishableIngestedSale): Promise<{ saleId: string }> {
  const admin = getAdminDb()
  const draftInput = normalizePublishInput(ingestedSale)
  const validated = PublishInputSchema.parse(draftInput)
  validateResolvedAddressForPublish(validated.address, validated.city, validated.state)
  const displayAddress = formatAddressForPublishedSaleDisplay(validated.address as string)

  const { ends_at, listing_timezone } = await resolvePersistableSaleEndsAt(
    admin,
    {
      date_start: validated.dateStart,
      time_start: validated.timeStart,
      date_end: validated.dateEnd,
      time_end: validated.timeEnd,
      zip_code: validated.zipCode,
      state: validated.state,
      lat: validated.lat,
      lng: validated.lng,
    },
    { operation: 'createPublishedSale', ingested_sale_id: validated.ingestedSaleId }
  )

  const salePayload = {
    owner_id: validated.ownerId,
    title: validated.title,
    description: validated.description,
    address: displayAddress,
    city: validated.city,
    state: validated.state,
    zip_code: validated.zipCode,
    lat: validated.lat,
    lng: validated.lng,
    date_start: validated.dateStart,
    date_end: validated.dateEnd,
    time_start: validated.timeStart,
    time_end: validated.timeEnd,
    ends_at,
    listing_timezone,
    cover_image_url: validated.coverImageUrl,
    images: validated.images,
    status: 'published',
    privacy_mode: 'exact',
    pricing_mode: 'negotiable',
    is_featured: false,
    import_source: validated.importSource,
    external_source_url: validated.externalSourceUrl,
    ingested_sale_id: validated.ingestedSaleId,
  }

  const { data, error } = await fromBase(admin, 'sales')
    .insert(salePayload)
    .select('id')
    .single()

  if (error || !data?.id) {
    const err = new Error(error?.message || 'Failed to create published sale') as Error & { pgCode?: string }
    if (error && typeof error === 'object' && 'code' in error && error.code != null) {
      err.pgCode = String((error as { code: unknown }).code)
    }
    throw err
  }

  return { saleId: data.id as string }
}

