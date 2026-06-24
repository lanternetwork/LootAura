import { buildIngestionCoreMetricsResponse } from '@/lib/admin/ingestionMetricsBuilder'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

/**
 * Narrow ingestion inputs for SEO index gates — orchestration-derived funnel and status counts only.
 * Does not run funnel cohort scan, needs_check root-cause, or dead-letter bucket queries.
 */
export async function buildSeoIngestionGateMetrics(): Promise<IngestionMetricsResponse> {
  return buildIngestionCoreMetricsResponse()
}
