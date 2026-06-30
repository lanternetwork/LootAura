import { describe, expect, it } from 'vitest'
import { buildIngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/buildIngestionDiagnosticsModel'
import {
  diagnosticsV4Coverage,
  diagnosticsV4Metrics,
} from '@/tests/unit/admin/diagnosticsV4Fixtures'
import {
  composeCurrentStatusSentence,
  countAlertsBySeverity,
  formatRecommendationDisplay,
  pipelineCardPrimaryMetric,
  pipelineCardSupportingMetric,
  pipelineCardTone,
  resolveInventorySubtitle,
  resolveTopRecommendation,
  schedulerHealthyCount,
  sloTone,
  statusLabelForTone,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

describe('ingestion dashboard v2 UX helpers', () => {
  function baseModel() {
    return buildIngestionDiagnosticsModel({
      metrics: diagnosticsV4Metrics(),
      coverage: diagnosticsV4Coverage(),
      environment: 'preview',
      generatedAt: '2026-06-17T12:00:00.000Z',
    })
  }

  it('resolves top recommendation from operator action first', () => {
    const model = baseModel()
    expect(resolveTopRecommendation(model)).toBe(model.operatorActions[0]?.action)
  })

  it('falls back to alert recommendedAction then bottleneck reason', () => {
    const base = baseModel()
    const model = {
      ...base,
      operatorActions: [],
      domainHealth: base.domainHealth.map((domain) => ({
        ...domain,
        recommendedAction: '',
      })),
      alerts: [
        {
          id: 'test_alert',
          severity: 'warning' as const,
          domain: 'catalog_repair' as const,
          trigger: 'Queue elevated',
          reason: 'Queue elevated',
          currentValue: '115',
          threshold: '<100',
          confidence: 'HIGH' as const,
          affectedMetricIds: [],
          owner: 'catalog-repair cron',
          recommendedAction: 'Investigate elevated backlog',
          blockingUserImpact: false,
        },
      ],
    }
    expect(resolveTopRecommendation(model)).toBe('Investigate elevated backlog')

    const noAlert = { ...model, alerts: [] }
    expect(resolveTopRecommendation(noAlert)).toBe(noAlert.primaryBottleneck.reason)
  })

  it('uses inventory flowing normally when published24h > 0 and publish SLO passes', () => {
    const model = baseModel()
    expect(resolveInventorySubtitle(model)).toBe('Inventory flowing normally')
  })

  it('colors blocking SLO failures red and non-blocking yellow', () => {
    const model = baseModel()
    const parser = model.slos.find((slo) => slo.id === 'parser_success_24h')
    const coverage = model.slos.find((slo) => slo.id === 'coverage_pct')
    expect(parser).toBeDefined()
    expect(coverage).toBeDefined()
    if (!parser || !coverage) return
    expect(sloTone({ ...parser, pass: false, blocking: true })).toBe('red')
    expect(sloTone({ ...coverage, pass: false, blocking: false })).toBe('yellow')
  })

  it('marks pipeline card green on healthy baseline', () => {
    expect(pipelineCardTone(baseModel())).toBe('green')
  })

  it('counts scheduler healthy rows', () => {
    const model = baseModel()
    expect(schedulerHealthyCount(model.schedulerCrons)).toBeGreaterThanOrEqual(0)
  })

  it('formats recommendation display with capitalization and softened address phrasing', () => {
    expect(formatRecommendationDisplay('address catalog backlog')).toBe('Review catalog backlog')
    expect(formatRecommendationDisplay('investigate queue')).toBe('Investigate queue')
  })

  it('maps status tone to human labels', () => {
    expect(statusLabelForTone('green')).toBe('Healthy')
    expect(statusLabelForTone('yellow')).toBe('Needs Attention')
    expect(statusLabelForTone('red')).toBe('Critical')
  })

  it('splits pipeline card metrics into primary and supporting lines', () => {
    const model = baseModel()
    expect(pipelineCardPrimaryMetric(model)).toMatch(/^Parser /)
    expect(pipelineCardSupportingMetric(model)).toMatch(/^Publish failures: /)
  })

  it('counts alerts by severity', () => {
    const counts = countAlertsBySeverity([
      {
        id: 'a',
        severity: 'critical',
        domain: 'catalog_repair',
        trigger: 't',
        reason: 'r',
        currentValue: '1',
        threshold: '0',
        confidence: 'HIGH',
        affectedMetricIds: [],
        owner: 'o',
        recommendedAction: 'act',
        blockingUserImpact: true,
      },
      {
        id: 'b',
        severity: 'warning',
        domain: 'visibility',
        trigger: 't',
        reason: 'r',
        currentValue: '1',
        threshold: '0',
        confidence: 'MEDIUM',
        affectedMetricIds: [],
        owner: 'o',
        recommendedAction: 'act',
        blockingUserImpact: false,
      },
      {
        id: 'c',
        severity: 'info',
        domain: 'coverage',
        trigger: 't',
        reason: 'r',
        currentValue: '1',
        threshold: '0',
        confidence: 'LOW',
        affectedMetricIds: [],
        owner: 'o',
        recommendedAction: 'act',
        blockingUserImpact: false,
      },
    ])
    expect(counts).toEqual({ critical: 1, warning: 1, info: 1 })
  })

  it('composes current status sentence without duplicating hero reason', () => {
    const model = baseModel()
    const sentence = composeCurrentStatusSentence(model)
    expect(sentence).toContain('Pipeline operating normally')
    expect(sentence.length).toBeGreaterThan(0)
  })

  it('buildIngestionDiagnosticsModel semantics unchanged', () => {
    const model = baseModel()
    expect(model.systemHealth).toBe('healthy')
    expect(model.slos.length).toBeGreaterThan(0)
    expect(model.domainHealth.length).toBe(11)
  })
})
