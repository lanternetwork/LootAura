import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { createPublishedSale } from '@/lib/ingestion/publish'
import { logger } from '@/lib/log'
import type { FailureReason } from '@/lib/ingestion/types'

interface ClaimedPublishRow {
  id: string
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
  failure_reasons: unknown
}

export interface PublishWorkerSummary {
  claimed: number
  published: number
  failed: number
}

function parseBatchSize(): number {
  const raw = process.env.INGEST_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : 100
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100
  }
  return Math.min(parsed, 500)
}

function toFailureReasons(value: unknown): FailureReason[] {
  if (!Array.isArray(value)) return []
  return value.filter((reason): reason is FailureReason => typeof reason === 'string')
}

function appendFailureReason(reasons: FailureReason[], reason: FailureReason): FailureReason[] {
  if (reasons.includes(reason)) return reasons
  return [...reasons, reason]
}

export async function publishReadyIngestedSales(): Promise<PublishWorkerSummary> {
  const admin = getAdminDb()
  const batchSize = parseBatchSize()

  const { data, error } = await (admin as any).rpc('claim_ingested_sales_for_publish', {
    p_batch_size: batchSize,
  })

  if (error) {
    logger.error('Failed to claim rows for publish worker', new Error(error.message), {
      component: 'ingestion/publishWorker',
      operation: 'claim_rows',
      batchSize,
    })
    throw error
  }

  const claimedRows = (Array.isArray(data) ? data : []) as ClaimedPublishRow[]
  const summary: PublishWorkerSummary = {
    claimed: claimedRows.length,
    published: 0,
    failed: 0,
  }

  for (const row of claimedRows) {
    let createdSaleId: string | null = null
    try {
      const { saleId } = await createPublishedSale({
        id: row.id,
        source_platform: row.source_platform,
        source_url: row.source_url,
        title: row.title,
        description: row.description,
        normalized_address: row.normalized_address,
        city: row.city,
        state: row.state,
        zip_code: row.zip_code,
        lat: row.lat,
        lng: row.lng,
        date_start: row.date_start,
        date_end: row.date_end,
        time_start: row.time_start,
        time_end: row.time_end,
        image_cloudinary_url: row.image_cloudinary_url,
      })
      createdSaleId = saleId

      const updatePayload = {
        status: 'published',
        published_sale_id: saleId,
        published_at: new Date().toISOString(),
      }
      const firstUpdate = await fromBase(admin, 'ingested_sales')
        .update(updatePayload)
        .eq('id', row.id)
      if (firstUpdate.error) {
        const secondUpdate = await fromBase(admin, 'ingested_sales')
          .update(updatePayload)
          .eq('id', row.id)
        if (secondUpdate.error) {
          logger.error(
            'Publish worker created sale but failed to update ingested row after retry',
            new Error(secondUpdate.error.message),
            {
              component: 'ingestion/publishWorker',
              operation: 'mark_published_retry_exhausted',
              rowId: row.id,
              saleId,
            }
          )
          summary.failed += 1
          continue
        }
      }

      summary.published += 1
      logger.info('Publish worker row processed', {
        component: 'ingestion/publishWorker',
        operation: 'row_result',
        rowId: row.id,
        result: 'success',
      })
    } catch (error) {
      summary.failed += 1
      if (createdSaleId) {
        logger.error(
          'Publish worker sale was created but row finalization failed before publish_failed transition',
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'ingestion/publishWorker',
            operation: 'row_result',
            rowId: row.id,
            saleId: createdSaleId,
            result: 'failure_after_sale_create',
          }
        )
        continue
      }

      const existingReasons = toFailureReasons(row.failure_reasons)
      const mergedReasons = appendFailureReason(existingReasons, 'publish_error')
      await fromBase(admin, 'ingested_sales')
        .update({
          status: 'publish_failed',
          failure_reasons: mergedReasons,
        })
        .eq('id', row.id)

      logger.error(
        'Publish worker row failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'ingestion/publishWorker',
          operation: 'row_result',
          rowId: row.id,
          result: 'failure',
        }
      )
    }
  }

  logger.info('Publish worker completed batch', {
    component: 'ingestion/publishWorker',
    operation: 'batch_complete',
    claimed: summary.claimed,
    published: summary.published,
    failed: summary.failed,
  })

  return summary
}

