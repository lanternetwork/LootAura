import type {
  IngestionDiagnosticsModel,
  SloEvaluationRow,
  SystemHealthLevel,
} from '@/lib/admin/diagnostics/v4/types'
import type { SchedulerCronRow } from '@/lib/admin/diagnostics/v4/types'

export type StatusTone = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

export const TONE_BORDER: Record<StatusTone, string> = {
  green: 'border-emerald-300',
  yellow: 'border-amber-300',
  red: 'border-red-300',
  gray: 'border-gray-300',
  blue: 'border-indigo-300',
}

export const TONE_BG: Record<StatusTone, string> = {
  green: 'bg-emerald-50',
  yellow: 'bg-amber-50',
  red: 'bg-red-50',
  gray: 'bg-gray-50',
  blue: 'bg-indigo-50',
}

export const TONE_PILL: Record<StatusTone, string> = {
  green: 'bg-emerald-600 text-white',
  yellow: 'bg-amber-500 text-white',
  red: 'bg-red-600 text-white',
  gray: 'bg-gray-500 text-white',
  blue: 'bg-indigo-600 text-white',
}

export const TONE_TEXT: Record<StatusTone, string> = {
  green: 'text-emerald-800',
  yellow: 'text-amber-900',
  red: 'text-red-800',
  gray: 'text-gray-700',
  blue: 'text-indigo-900',
}

export function healthTone(level: SystemHealthLevel): StatusTone {
  switch (level) {
    case 'healthy':
      return 'green'
    case 'degraded':
      return 'yellow'
    case 'critical':
      return 'red'
  }
}

export function sloTone(slo: SloEvaluationRow): StatusTone {
  if (slo.pass) return 'green'
  if (slo.blocking) return 'red'
  return 'yellow'
}

export function alertTone(severity: 'critical' | 'warning' | 'info'): StatusTone {
  switch (severity) {
    case 'critical':
      return 'red'
    case 'warning':
      return 'yellow'
    case 'info':
      return 'gray'
  }
}

export function findSlo(model: IngestionDiagnosticsModel, id: string): SloEvaluationRow | undefined {
  return model.slos.find((slo) => slo.id === id)
}

export function findDomain(model: IngestionDiagnosticsModel, id: string) {
  return model.domainHealth.find((domain) => domain.id === id)
}

export function resolveTopRecommendation(model: IngestionDiagnosticsModel): string {
  const primary = model.operatorActions[0]?.action
  if (primary) return primary

  const domainAction = model.domainHealth.find(
    (domain) => domain.domain === model.primaryBottleneck.domain
  )?.recommendedAction
  if (domainAction) return domainAction

  const alertAction = model.alerts[0]?.recommendedAction
  if (alertAction) return alertAction

  return model.primaryBottleneck.reason
}

export function resolveInventorySubtitle(model: IngestionDiagnosticsModel): string {
  const published24h = model.metrics.published24h
  const publishSlo = findSlo(model, 'publish_failed_terminal')

  if (published24h > 0 && (!publishSlo || publishSlo.pass)) {
    return 'Inventory flowing normally'
  }
  if (publishSlo && !publishSlo.pass) {
    return `Publish pressure: ${publishSlo.actual} (target ${publishSlo.target})`
  }
  if (published24h === 0) {
    return 'No publishes in last 24h'
  }
  return 'Review publish pipeline'
}

export function pipelineCardTone(model: IngestionDiagnosticsModel): StatusTone {
  const parser = findSlo(model, 'parser_success_24h')
  const publish = findSlo(model, 'publish_failed_terminal')

  if (parser && !parser.pass && parser.blocking) return 'red'
  if (publish && !publish.pass && publish.blocking) return 'red'
  if (parser && !parser.pass) return 'yellow'
  if (publish && !publish.pass) return 'yellow'
  return 'green'
}

export function pipelineCardMetric(model: IngestionDiagnosticsModel): string {
  const parser = findSlo(model, 'parser_success_24h')
  const publish = findSlo(model, 'publish_failed_terminal')
  const parserActual = parser?.actual ?? '—'
  const publishActual = publish?.actual ?? '—'
  return `Parser ${parserActual} · Publish failed ${publishActual}`
}

export function pipelineCardThreshold(model: IngestionDiagnosticsModel): string {
  const parser = findSlo(model, 'parser_success_24h')
  const publish = findSlo(model, 'publish_failed_terminal')
  return `Parser ${parser?.target ?? '—'} · Publish ${publish?.target ?? '—'}`
}

export function pipelineCardSummary(model: IngestionDiagnosticsModel): string {
  const tone = pipelineCardTone(model)
  if (tone === 'green') return 'Hot-path ingestion healthy'
  if (tone === 'red') return 'Blocking hot-path failure'
  return 'Hot-path needs attention'
}

export function schedulerHealthyCount(crons: readonly SchedulerCronRow[]): number {
  return crons.filter((cron) => cron.state === 'ok').length
}

export function schedulerCardTone(model: IngestionDiagnosticsModel): StatusTone {
  const domain = findDomain(model, 'scheduler')
  return domain ? healthTone(domain.status) : 'gray'
}

export function bottleneckCountLabel(model: IngestionDiagnosticsModel): string | null {
  const pressure = model.primaryBottleneck.secondaryPressures[0]
  if (!pressure) return null
  return `${pressure.count.toLocaleString()} ${pressure.label}`
}

export function formatPayloadBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes.toLocaleString()} B`
}
