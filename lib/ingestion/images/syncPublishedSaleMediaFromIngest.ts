import { sanitizeExternalImageUrls } from '@/lib/ingestion/externalImageValidation'
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { extractPublishImageCandidates } from '@/lib/ingestion/publishImageCandidates'
import { computeImportedListingImageSyncIntent } from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type SyncPublishedSaleMediaOutcome =
  | 'not_linked'
  | 'no_candidates'
  | 'all_candidates_rejected'
  | 'sale_not_found'
  | 'hidden_by_admin'
  | 'link_mismatch'
  | 'intent_none'
  | 'updated_full'
  | 'updated_cover_only'
  | 'update_failed'

export type SyncPublishedSaleMediaResult = {
  outcome: SyncPublishedSaleMediaOutcome
  publishedSaleId?: string
  sanitizedCount?: number
  candidateCount?: number
}

type IngestLinkRow = {
  published_sale_id: string | null
  city: string | null
  state: string | null
  status: string | null
}

type SaleMediaRow = {
  ingested_sale_id: string | null
  cover_image_url: string | null
  images: unknown
  description: string | null
  moderation_status: string | null
}

/**
 * After ingest image fields are enriched, patch linked published sale media only.
 * Does not change ingest status, geocode lifecycle, or invoke publish.
 */
export async function syncPublishedSaleMediaFromIngestedRow(params: {
  rowId: string
  imageSourceUrl: string | null
  rawPayload: unknown
  city?: string | null
  state?: string | null
}): Promise<SyncPublishedSaleMediaResult> {
  const admin = getAdminDb()
  const logBase = {
    component: 'ingestion/images/syncPublishedSaleMediaFromIngest',
    rowId: params.rowId,
  }

  let city = params.city ?? null
  let state = params.state ?? null
  let publishedSaleId: string | null = null

  try {
    const { data: ingestRow, error: ingestErr } = await fromBase(admin, 'ingested_sales')
      .select('published_sale_id, city, state, status')
      .eq('id', params.rowId)
      .maybeSingle()

    if (ingestErr) {
      logger.warn('Post-enrich sale media sync skipped: ingest load failed', {
        ...logBase,
        operation: 'load_ingest_row',
        message: ingestErr.message,
      })
      return { outcome: 'not_linked' }
    }

    const link = ingestRow as IngestLinkRow | null
    if (!link) {
      return { outcome: 'not_linked' }
    }

    city = city ?? link.city
    state = state ?? link.state
    publishedSaleId =
      typeof link.published_sale_id === 'string' && link.published_sale_id.trim().length > 0
        ? link.published_sale_id.trim()
        : null

    if (!publishedSaleId) {
      return { outcome: 'not_linked' }
    }

    const candidates = extractPublishImageCandidates(params.rawPayload, params.imageSourceUrl)
    if (candidates.length === 0) {
      return { outcome: 'no_candidates', publishedSaleId, candidateCount: 0 }
    }

    const sanitizedImages = await sanitizeExternalImageUrls(candidates, {
      rowId: params.rowId,
      city,
      state,
      max: MAX_IMPORTED_LISTING_IMAGES,
    })

    if (sanitizedImages.length === 0) {
      logger.info('Post-enrich sale media sync skipped: no valid sanitized images', {
        ...logBase,
        operation: 'sanitize_candidates',
        publishedSaleId,
        candidateCount: candidates.length,
        sanitizedCount: 0,
      })
      return {
        outcome: 'all_candidates_rejected',
        publishedSaleId,
        candidateCount: candidates.length,
        sanitizedCount: 0,
      }
    }

    const { data: saleRow, error: saleErr } = await fromBase(admin, 'sales')
      .select('ingested_sale_id, cover_image_url, images, description, moderation_status')
      .eq('id', publishedSaleId)
      .maybeSingle()

    if (saleErr) {
      logger.warn('Post-enrich sale media sync skipped: sale load failed', {
        ...logBase,
        operation: 'load_sale_row',
        publishedSaleId,
        message: saleErr.message,
      })
      return { outcome: 'sale_not_found', publishedSaleId }
    }

    const sale = saleRow as SaleMediaRow | null
    if (!sale) {
      return { outcome: 'sale_not_found', publishedSaleId }
    }

    if (sale.moderation_status === 'hidden_by_admin') {
      logger.warn('Post-enrich sale media sync skipped: hidden_by_admin', {
        ...logBase,
        operation: 'moderation_guard',
        publishedSaleId,
      })
      return { outcome: 'hidden_by_admin', publishedSaleId }
    }

    if (sale.ingested_sale_id !== params.rowId) {
      logger.warn('Post-enrich sale media sync skipped: ingested row ownership mismatch', {
        ...logBase,
        operation: 'link_mismatch',
        publishedSaleId,
        linkedIngestedSaleId: sale.ingested_sale_id,
      })
      return { outcome: 'link_mismatch', publishedSaleId }
    }

    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: sale.cover_image_url,
        images: sale.images,
        description: sale.description,
      },
      sanitizedImages,
    })

    if (intent.kind === 'none') {
      return {
        outcome: 'intent_none',
        publishedSaleId,
        candidateCount: candidates.length,
        sanitizedCount: sanitizedImages.length,
      }
    }

    const patch: Record<string, unknown> =
      intent.kind === 'full'
        ? { cover_image_url: intent.cover_image_url, images: intent.images }
        : { cover_image_url: intent.cover_image_url }

    const { error: updateErr } = await fromBase(admin, 'sales').update(patch).eq('id', publishedSaleId)

    if (updateErr) {
      logger.warn('Post-enrich sale media sync failed', {
        ...logBase,
        operation: 'update_sale_media',
        publishedSaleId,
        intentKind: intent.kind,
        message: updateErr.message,
      })
      return {
        outcome: 'update_failed',
        publishedSaleId,
        candidateCount: candidates.length,
        sanitizedCount: sanitizedImages.length,
      }
    }

    const outcome: SyncPublishedSaleMediaOutcome =
      intent.kind === 'full' ? 'updated_full' : 'updated_cover_only'

    logger.info('Post-enrich sale media sync completed', {
      ...logBase,
      operation: 'update_sale_media',
      publishedSaleId,
      intentKind: intent.kind,
      sanitizedCount: sanitizedImages.length,
      candidateCount: candidates.length,
    })

    return {
      outcome,
      publishedSaleId,
      candidateCount: candidates.length,
      sanitizedCount: sanitizedImages.length,
    }
  } catch (error) {
    logger.warn('Post-enrich sale media sync threw; continuing enrichment', {
      ...logBase,
      operation: 'unexpected_error',
      publishedSaleId: publishedSaleId ?? undefined,
      message: error instanceof Error ? error.message : String(error),
    })
    return { outcome: 'update_failed', publishedSaleId: publishedSaleId ?? undefined }
  }
}
