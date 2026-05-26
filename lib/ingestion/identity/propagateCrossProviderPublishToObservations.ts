import { isCrossProviderPublishLinkEnforcementEnabled } from '@/lib/ingestion/identity/crossProviderShadowEnforcement'
import type { IngestionStatus } from '@/lib/ingestion/types'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

const OBSERVATION_PROPAGATE_STATUSES: readonly IngestionStatus[] = [
  'ready',
  'needs_check',
  'needs_geocode',
  'publishing',
]

export type PropagateCrossProviderPublishInput = {
  canonicalSaleInstanceKey: string
  publishedSaleId: string
  primaryIngestedSaleId: string
  excludeIngestedSaleId: string
}

/**
 * When a primary ingested row publishes, finalize sibling cross-provider observations to the same sale.
 */
export async function propagateCrossProviderPublishToObservations(
  input: PropagateCrossProviderPublishInput
): Promise<{ updatedCount: number }> {
  if (!isCrossProviderPublishLinkEnforcementEnabled()) {
    return { updatedCount: 0 }
  }

  const canonicalKey = input.canonicalSaleInstanceKey.trim()
  if (!canonicalKey) {
    return { updatedCount: 0 }
  }

  const admin = getAdminDb()
  const publishedAt = new Date().toISOString()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({
      status: 'published',
      published_sale_id: input.publishedSaleId,
      published_at: publishedAt,
      duplicate_of: input.primaryIngestedSaleId,
    })
    .eq('canonical_sale_instance_key', canonicalKey)
    .eq('is_duplicate', true)
    .is('published_sale_id', null)
    .neq('id', input.excludeIngestedSaleId)
    .in('status', [...OBSERVATION_PROPAGATE_STATUSES])
    .select('id')

  if (error) {
    logger.warn('cross_provider_publish_link: observation propagation failed', {
      component: 'ingestion/cross_provider_publish_link',
      canonicalSaleInstanceKey: canonicalKey,
      primaryIngestedSaleId: input.primaryIngestedSaleId,
      message: error.message,
    })
    return { updatedCount: 0 }
  }

  const updatedCount = Array.isArray(data) ? data.length : 0
  if (updatedCount > 0) {
    logger.info('cross_provider_publish_link: observations propagated', {
      component: 'ingestion/cross_provider_publish_link',
      operation: 'propagate_observations',
      canonicalSaleInstanceKey: canonicalKey,
      primaryIngestedSaleId: input.primaryIngestedSaleId,
      publishedSaleId: input.publishedSaleId,
      updatedCount,
    })
  }

  return { updatedCount }
}
