import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { PublishInputSchema } from '@/lib/ingestion/schemas'
import type { PublishInput } from '@/lib/ingestion/types'

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
}

// Temporary explicit system owner for ingestion-published sales.
// Must match an existing profiles.id/auth user id in the target environment.
const FIXED_INGEST_OWNER_ID = 'b2750036-4a71-404a-9020-1734b5b888b1'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeAddressForPublish(
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
  return `${withoutDuplicateSuffix}, ${cityState}`
}

function normalizePublishInput(ingestedSale: PublishableIngestedSale): PublishInput {
  const ownerId = ingestedSale.owner_id?.trim() || FIXED_INGEST_OWNER_ID
  const title = (ingestedSale.title || '').trim() || `${ingestedSale.city || 'Unknown'} Yard Sale`
  const city = (ingestedSale.city || '').trim()
  const state = (ingestedSale.state || '').trim()
  const address = normalizeAddressForPublish(ingestedSale.normalized_address, city, state)
  const coverImageUrl = ingestedSale.image_cloudinary_url?.trim() || null
  const images = coverImageUrl ? [coverImageUrl] : null

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

export async function createPublishedSale(ingestedSale: PublishableIngestedSale): Promise<{ saleId: string }> {
  const admin = getAdminDb()
  const draftInput = normalizePublishInput(ingestedSale)
  const validated = PublishInputSchema.parse(draftInput)

  const salePayload = {
    owner_id: validated.ownerId,
    title: validated.title,
    description: validated.description,
    address: validated.address || 'Unknown address',
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

