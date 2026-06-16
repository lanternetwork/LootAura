import type { DuplicateCanonicalPublishCluster } from '@/lib/admin/duplicateCanonicalPublishClusterTypes'
import type { BuildSeoOperationalDiagnosticsInput } from '@/lib/admin/buildSeoOperationalDiagnostics'
import type { CoverageTieredSchedulerState } from '@/lib/ingestion/ystmCoverage/coverageTieredSchedulerMode'

export type IngestionDiagnosticsSupplements = {
  tieredScheduler?: CoverageTieredSchedulerState | null
  tieredSchedulerError?: string | null
  seoOperational?: BuildSeoOperationalDiagnosticsInput | null
  duplicateCanonicalClusters?: {
    generatedAt: string
    clusters: DuplicateCanonicalPublishCluster[]
  } | null
  duplicateCanonicalClustersError?: string | null
}
