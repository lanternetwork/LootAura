import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { OperationalHealthCard } from '@/app/admin/ingestion/v2/OperationalHealthCard'
import {
  findDomain,
  healthTone,
  pipelineCardPrimaryMetric,
  pipelineCardSupportingMetric,
  pipelineCardSummary,
  pipelineCardThreshold,
  pipelineCardTone,
  schedulerCardTone,
  schedulerHealthyCount,
  statusLabelForTone,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function OperationalHealthCards({ model }: { model: IngestionDiagnosticsModel }) {
  const catalog = findDomain(model, 'catalog_repair')
  const visibility = findDomain(model, 'visibility')
  const coverage = findDomain(model, 'coverage')
  const duplicates = findDomain(model, 'duplicate_detection')
  const scheduler = findDomain(model, 'scheduler')

  const pipelineTone = pipelineCardTone(model)

  return (
    <section className="mb-6">
      <h2 className="mb-4 text-base font-bold text-gray-900">Operational Health</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <OperationalHealthCard
          title="Pipeline"
          tone={pipelineTone}
          statusLabel={statusLabelForTone(pipelineTone)}
          primaryMetric={pipelineCardPrimaryMetric(model)}
          supportingMetric={pipelineCardSupportingMetric(model)}
          threshold={pipelineCardThreshold(model)}
          summary={pipelineCardSummary(model)}
        />
        {catalog ? (
          <OperationalHealthCard
            title="Catalog Repair"
            tone={healthTone(catalog.status)}
            statusLabel={statusLabelForTone(healthTone(catalog.status))}
            primaryMetric={`${model.catalogRepair.queueTotal} queue`}
            supportingMetric={`${model.catalogRepair.needsCheck} needs_check`}
            threshold={`Target ${catalog.threshold}`}
            summary={catalog.primaryReason}
          />
        ) : null}
        {visibility ? (
          <OperationalHealthCard
            title="Visibility"
            tone={healthTone(visibility.status)}
            statusLabel={statusLabelForTone(healthTone(visibility.status))}
            primaryMetric={`${model.visibility.trueVisibilityFailureCount} failures`}
            supportingMetric={`${model.visibility.observationStaleCount} obs stale`}
            threshold={`Target ${visibility.threshold}`}
            summary={visibility.primaryReason}
          />
        ) : null}
        {coverage ? (
          <OperationalHealthCard
            title="Coverage"
            tone={healthTone(coverage.status)}
            statusLabel={statusLabelForTone(healthTone(coverage.status))}
            primaryMetric={
              model.coverage?.coveragePct != null
                ? `${model.coverage.coveragePct.toFixed(1)}%`
                : coverage.currentMetric
            }
            supportingMetric={`Target ${coverage.threshold}`}
            threshold={coverage.threshold}
            summary={coverage.primaryReason}
          />
        ) : null}
        {duplicates ? (
          <OperationalHealthCard
            title="Duplicates"
            tone={healthTone(duplicates.status)}
            statusLabel={statusLabelForTone(healthTone(duplicates.status))}
            primaryMetric={`${model.duplicates.canonicalPublishClusters} canonical`}
            supportingMetric={`${model.duplicates.visibleDuplicateClusters} visible clusters`}
            threshold={`Target ${duplicates.threshold}`}
            summary={duplicates.primaryReason}
          />
        ) : null}
        {scheduler ? (
          <OperationalHealthCard
            title="Scheduler"
            tone={schedulerCardTone(model)}
            statusLabel={statusLabelForTone(schedulerCardTone(model))}
            primaryMetric={`${schedulerHealthyCount(model.schedulerCrons)} / ${model.schedulerCrons.length} healthy`}
            supportingMetric={scheduler.primaryReason}
            threshold={`Target ${scheduler.threshold}`}
            summary={scheduler.primaryReason}
          />
        ) : null}
      </div>
    </section>
  )
}
