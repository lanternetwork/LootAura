import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { OperationalHealthCard } from '@/app/admin/ingestion/v2/OperationalHealthCard'
import {
  findDomain,
  healthTone,
  pipelineCardMetric,
  pipelineCardSummary,
  pipelineCardThreshold,
  pipelineCardTone,
  schedulerCardTone,
  schedulerHealthyCount,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function OperationalHealthCards({ model }: { model: IngestionDiagnosticsModel }) {
  const catalog = findDomain(model, 'catalog_repair')
  const visibility = findDomain(model, 'visibility')
  const coverage = findDomain(model, 'coverage')
  const duplicates = findDomain(model, 'duplicate_detection')
  const scheduler = findDomain(model, 'scheduler')

  return (
    <section className="mb-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
        Operational Health
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <OperationalHealthCard
          title="Pipeline"
          subtitle="Hot-path ingestion"
          tone={pipelineCardTone(model)}
          metric={pipelineCardMetric(model)}
          threshold={pipelineCardThreshold(model)}
          summary={pipelineCardSummary(model)}
        />
        {catalog ? (
          <OperationalHealthCard
            title="Catalog Repair"
            tone={healthTone(catalog.status)}
            metric={catalog.currentMetric}
            threshold={catalog.threshold}
            summary={catalog.primaryReason}
          />
        ) : null}
        {visibility ? (
          <OperationalHealthCard
            title="Visibility"
            tone={healthTone(visibility.status)}
            metric={`${model.visibility.trueVisibilityFailureCount} failures`}
            threshold={visibility.threshold}
            summary={`${model.visibility.classificationMode} · ${model.visibility.observationStaleCount} obs stale`}
          />
        ) : null}
        {coverage ? (
          <OperationalHealthCard
            title="Coverage"
            tone={healthTone(coverage.status)}
            metric={
              model.coverage?.coveragePct != null
                ? `${model.coverage.coveragePct.toFixed(1)}%`
                : coverage.currentMetric
            }
            threshold={coverage.threshold}
            summary={coverage.primaryReason}
          />
        ) : null}
        {duplicates ? (
          <OperationalHealthCard
            title="Duplicates"
            tone={healthTone(duplicates.status)}
            metric={`Canonical ${model.duplicates.canonicalPublishClusters}`}
            threshold={duplicates.threshold}
            summary={`${model.duplicates.visibleDuplicateClusters} visible clusters`}
          />
        ) : null}
        {scheduler ? (
          <OperationalHealthCard
            title="Scheduler"
            tone={schedulerCardTone(model)}
            metric={`${schedulerHealthyCount(model.schedulerCrons)} / ${model.schedulerCrons.length} Healthy`}
            threshold={scheduler.threshold}
            summary={scheduler.primaryReason}
          />
        ) : null}
      </div>
    </section>
  )
}
