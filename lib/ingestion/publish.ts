import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { FIXED_INGEST_OWNER_ID } from '@/lib/ingestion/fixedIngestOwnerId'
import { uspsCodeToFullNameForAddress } from '@/lib/ingestion/adapters/usStateListPathSegment'
import { PublishInputSchema } from '@/lib/ingestion/schemas'
import type { PublishInput } from '@/lib/ingestion/types'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'
import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'
import { sanitizeExternalImageUrls } from '@/lib/ingestion/externalImageValidation'

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** City + state (USPS or full name) and optional ZIP already present — do not append again. */
function addressAlreadyContainsCityState(address: string, city: string, state: string): boolean {
  const cityNorm = city.replace(/\s+/g, ' ').trim()
  const stateNorm = state.replace(/\s+/g, ' ').trim()
  if (!cityNorm || !stateNorm) return false

  const cityEsc = escapeRegExp(cityNorm)
  const optionalZip = '(?:\\s+\\d{5}(?:-\\d{4})?)?'
  const statePatterns = [escapeRegExp(stateNorm)]
  if (stateNorm.length === 2) {
    const full = uspsCodeToFullNameForAddress(stateNorm)
    if (full) statePatterns.push(escapeRegExp(full))
  }

  for (const stateEsc of statePatterns) {
    if (new RegExp(`${cityEsc}\\s*,\\s*${stateEsc}${optionalZip}`, 'i').test(address)) {
      return true
    }
  }
  return false
}

/** Normalizes ingested address lines for publish; exported for unit tests. */
export function normalizeAddressForPublish(
  normalizedAddress: string | null,
  city: string,
  state: string
): string | null {
  const base = (normalizedAddress || '').replace(/\s+/g, ' ').trim()
  if (!base) return null

  const cityState = [city, state].map((v) => v.trim()).filter(Boolean).join(', ')
  if (!cityState) return base

  const suffixPattern = new RegExp(`(?:,\\s*${escapeRegExp(cityState)})+$`, 'i')
  const withoutDuplicateSuffix = base.replace(suffixPattern, '').replace(/\s*,\s*$/g, '').trim()

  if (!withoutDuplicateSuffix) return cityState
  if (addressAlreadyContainsCityState(withoutDuplicateSuffix, city, state)) {
    return withoutDuplicateSuffix
  }
  return `${withoutDuplicateSuffix}, ${cityState}`
}

function normalizePublishInput(ingestedSale: PublishableIngestedSale): PublishInput {
  const ownerId = ingestedSale.owner_id?.trim() || FIXED_INGEST_OWNER_ID
  const title = (ingestedSale.title || '').trim() || `${ingestedSale.city || 'Unknown'} Yard Sale`
  const city = (ingestedSale.city || '').trim()
  const state = (ingestedSale.state || '').trim()
  const address = normalizeAddressForPublish(ingestedSale.normalized_address, city, state)
  const normalizedImages = Array.isArray(ingestedSale.image_urls)
    ? ingestedSale.image_urls
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    : []
  /** Cloudinary fallback is merged in `applySanitizedCloudinaryFallback` so it cannot bypass branding checks. */
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
    timeStart: ingestedSale.time_start || '09:00:00',
    timeEnd: ingestedSale.time_end,
    coverImageUrl,
    images,
    importSource: ingestedSale.source_platform,
    externalSourceUrl: ingestedSale.source_url,
    ingestedSaleId: ingestedSale.id,
  }
}

/**
 * When listing URLs were all rejected, optionally fill images from `image_cloudinary_url`
 * only after the same external-image validation as other candidates.
 */
export async function applySanitizedCloudinaryFallback(
  ingestedSale: PublishableIngestedSale,
  draftInput: PublishInput
): Promise<void> {
  const hasImages =
    (Array.isArray(draftInput.images) && draftInput.images.length > 0) || !!draftInput.coverImageUrl
  if (hasImages) return
  const raw = ingestedSale.image_cloudinary_url?.trim()
  if (!raw) return
  const sanitized = await sanitizeExternalImageUrls([raw], {
    rowId: ingestedSale.id,
    city: ingestedSale.city,
    state: ingestedSale.state,
    max: 3,
  })
  if (sanitized.length === 0) return
  draftInput.coverImageUrl = sanitized[0]!
  draftInput.images = [...sanitized]
}

export async function createPublishedSale(ingestedSale: PublishableIngestedSale): Promise<{ saleId: string }> {
  const admin = getAdminDb()
  const draftInput = normalizePublishInput(ingestedSale)
  await applySanitizedCloudinaryFallback(ingestedSale, draftInput)
  const validated = PublishInputSchema.parse(draftInput)
  validateResolvedAddressForPublish(validated.address, validated.city, validated.state)
  const displayAddress = formatAddressForPublishedSaleDisplay(validated.address as string)

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

