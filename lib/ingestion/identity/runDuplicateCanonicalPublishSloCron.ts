import { countDuplicatePublishedCanonicalClusters } from '@/lib/admin/duplicateCanonicalPublishClusters'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type DuplicateCanonicalPublishSloCronResult = {
  ok: boolean
  duplicateClusterCount: number
  sloMet: boolean
  checkedAt: string
}

/**
 * Phase 1A: daily operational SLO — no canonical key may map to >1 distinct published_sale_id.
 */
export async function runDuplicateCanonicalPublishSloCron(): Promise<DuplicateCanonicalPublishSloCronResult> {
  const admin = getAdminDb()
  const checkedAt = new Date().toISOString()
  const duplicateClusterCount = await countDuplicatePublishedCanonicalClusters(admin)
  const sloMet = duplicateClusterCount === 0

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.duplicateCanonicalPublishSloCheck, {
      duplicateClusterCount,
      sloMet,
      checkedAt,
      alert: sloMet ? 'none' : 'duplicate_canonical_publish_clusters',
    })
  )

  if (!sloMet) {
    logger.warn('duplicate canonical publish SLO violated', {
      component: 'ingestion/convergence/duplicate_canonical_publish_slo',
      duplicateClusterCount,
      checkedAt,
    })
  } else {
    logger.info('duplicate canonical publish SLO check passed', {
      component: 'ingestion/convergence/duplicate_canonical_publish_slo',
      duplicateClusterCount,
      checkedAt,
    })
  }

  return {
    ok: sloMet,
    duplicateClusterCount,
    sloMet,
    checkedAt,
  }
}
