import { z } from 'zod'
import { isPublishableExternalImageUrl } from '@/lib/ingestion/externalImageValidation'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const RemediateUnloadableImportedSaleMediaSchema = z.object({
  batchSize: z.number().int().min(1).max(500).default(100),
  dryRun: z.boolean().default(false),
})

export type RemediateUnloadableImportedSaleMediaInput = z.infer<
  typeof RemediateUnloadableImportedSaleMediaSchema
>

export type RemediateUnloadableImportedSaleMediaSummary = {
  scanned: number
  remediated: number
  skipped: number
  clearedCoverUrls: number
  clearedGalleryUrls: number
  dryRun: boolean
}

type SaleMediaRow = {
  id: string
  cover_image_url: string | null
  images: string[] | null
  ingested_sale_id: string | null
  import_source: string | null
}

function hasImportProvenance(row: SaleMediaRow): boolean {
  if (row.ingested_sale_id) return true
  const source = row.import_source?.trim()
  return Boolean(source)
}

function normalizeGalleryImages(images: string[] | null): string[] {
  if (!Array.isArray(images)) return []
  return images
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function filterPublishableUrls(urls: string[]): Promise<string[]> {
  const out: string[] = []
  for (const url of urls) {
    if (await isPublishableExternalImageUrl(url)) {
      out.push(url)
    }
  }
  return out
}

/**
 * Bounded admin remediation: clear cover/gallery URLs on imported sales that fail publish-time image probes.
 * Does not touch user-authored sales without import provenance.
 */
export async function remediateUnloadableImportedSaleMedia(
  input: RemediateUnloadableImportedSaleMediaInput
): Promise<RemediateUnloadableImportedSaleMediaSummary> {
  const parsed = RemediateUnloadableImportedSaleMediaSchema.parse(input)
  const admin = getAdminDb()
  const summary: RemediateUnloadableImportedSaleMediaSummary = {
    scanned: 0,
    remediated: 0,
    skipped: 0,
    clearedCoverUrls: 0,
    clearedGalleryUrls: 0,
    dryRun: parsed.dryRun,
  }

  const { data: rows, error } = await fromBase(admin, 'sales')
    .select('id, cover_image_url, images, ingested_sale_id, import_source')
    .or('ingested_sale_id.not.is.null,import_source.not.is.null')
    .order('updated_at', { ascending: true })
    .limit(parsed.batchSize)

  if (error) {
    throw new Error(error.message)
  }

  for (const raw of rows ?? []) {
    const row = raw as SaleMediaRow
    summary.scanned += 1

    if (!hasImportProvenance(row)) {
      summary.skipped += 1
      continue
    }

    const cover =
      typeof row.cover_image_url === 'string' && row.cover_image_url.trim()
        ? row.cover_image_url.trim()
        : null
    const gallery = normalizeGalleryImages(row.images)

    if (!cover && gallery.length === 0) {
      summary.skipped += 1
      continue
    }

    const nextCover = cover && (await isPublishableExternalImageUrl(cover)) ? cover : null
    const nextGallery = await filterPublishableUrls(gallery)

    const coverChanged = cover !== nextCover
    const galleryChanged =
      gallery.length !== nextGallery.length || gallery.some((url, idx) => url !== nextGallery[idx])

    if (!coverChanged && !galleryChanged) {
      summary.skipped += 1
      continue
    }

    if (coverChanged && cover) summary.clearedCoverUrls += 1
    if (galleryChanged) {
      summary.clearedGalleryUrls += Math.max(0, gallery.length - nextGallery.length)
    }

    if (!parsed.dryRun) {
      const patch: { cover_image_url: string | null; images: string[] } = {
        cover_image_url: nextCover,
        images: nextGallery,
      }
      const { error: updateErr } = await fromBase(admin, 'sales').update(patch).eq('id', row.id)
      if (updateErr) {
        logger.warn('Unloadable imported sale media remediation update failed', {
          component: 'ingestion/images/remediateUnloadableImportedSaleMedia',
          operation: 'update_sale',
          saleId: row.id,
          message: updateErr.message,
        })
        summary.skipped += 1
        continue
      }
    }

    summary.remediated += 1
  }

  return summary
}
