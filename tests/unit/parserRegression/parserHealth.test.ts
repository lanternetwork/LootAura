import { describe, expect, it } from 'vitest'
import {
  classifyParserHealth,
  classifyParserHealthFromCounts,
  DEFAULT_PARSER_HEALTH_THRESHOLDS,
  defaultParserHealthThresholds,
  type ParserHealthMetricsInput,
} from '@/lib/parserRegression/parserHealth'

const neutral = (): ParserHealthMetricsInput => ({
  fixtureMismatchRate: 0,
  zeroListingRate: 0,
  selectorMissingRate: 0,
  malformedSourceRate: 0,
  unsupportedLayoutRate: 0,
  averageParseDurationMs: 0,
  duplicateSuppressionAnomalyRate: 0,
})

describe('classifyParserHealth', () => {
  it('is deterministic for identical inputs', () => {
    const input = { ...neutral(), zeroListingRate: 0.3 }
    expect(classifyParserHealth(input)).toEqual(classifyParserHealth(input))
  })

  it('fail-closed: rate above 1 fails to failing', () => {
    const r = classifyParserHealth({ ...neutral(), fixtureMismatchRate: 1.5 })
    expect(r.status).toBe('failing')
    expect(r.score).toBe(0)
    expect(r.reasons).toContain('invalid_metrics')
  })

  it('fail-closed: negative rate fails to failing', () => {
    const r = classifyParserHealth({ ...neutral(), zeroListingRate: -0.01 })
    expect(r.status).toBe('failing')
    expect(r.reasons).toContain('invalid_metrics')
  })

  it('fail-closed: NaN duration fails to failing', () => {
    const r = classifyParserHealth({ ...neutral(), averageParseDurationMs: Number.NaN })
    expect(r.status).toBe('failing')
    expect(r.reasons).toContain('invalid_metrics')
  })

  it('fail-closed: malformed threshold ordering fails to failing', () => {
    const t = defaultParserHealthThresholds()
    const bad = { ...t, fixtureMismatchFailing: t.fixtureMismatchDegraded }
    const r = classifyParserHealth(neutral(), bad)
    expect(r.status).toBe('failing')
    expect(r.reasons).toContain('invalid_metrics')
  })

  it('boundary: zero listing exactly at degraded threshold is degraded', () => {
    const t = defaultParserHealthThresholds()
    const r = classifyParserHealth({ ...neutral(), zeroListingRate: t.zeroListingDegraded }, t)
    expect(r.status).toBe('degraded')
    expect(r.reasons).toContain('high_zero_listing_rate')
  })

  it('boundary: zero listing just below degraded threshold is healthy', () => {
    const t = defaultParserHealthThresholds()
    const r = classifyParserHealth({ ...neutral(), zeroListingRate: t.zeroListingDegraded - 1e-9 }, t)
    expect(r.status).toBe('healthy')
    expect(r.reasons).toHaveLength(0)
  })

  it('boundary: average parse exactly at degraded threshold is degraded', () => {
    const t = defaultParserHealthThresholds()
    const r = classifyParserHealth({ ...neutral(), averageParseDurationMs: t.averageParseDurationMsDegraded }, t)
    expect(r.status).toBe('degraded')
    expect(r.reasons).toContain('slow_average_parse_duration')
  })

  it('boundary: average parse just below degraded threshold is healthy', () => {
    const t = defaultParserHealthThresholds()
    const r = classifyParserHealth(
      { ...neutral(), averageParseDurationMs: t.averageParseDurationMsDegraded - 1 },
      t
    )
    expect(r.status).toBe('healthy')
    expect(r.reasons).toHaveLength(0)
  })

  it('marks failing on extreme zero listing rate', () => {
    const r = classifyParserHealth({ ...neutral(), zeroListingRate: 0.9 })
    expect(r.status).toBe('failing')
    expect(r.reasons).toContain('high_zero_listing_rate')
  })

  it('respects custom thresholds deterministically', () => {
    const t = defaultParserHealthThresholds()
    const strict = { ...t, zeroListingDegraded: 0.05 }
    const r = classifyParserHealth({ ...neutral(), zeroListingRate: 0.08 }, strict)
    expect(r.status).toBe('degraded')
    expect(r.reasons).toContain('high_zero_listing_rate')
  })

  it('exposes stable default constants', () => {
    expect(DEFAULT_PARSER_HEALTH_THRESHOLDS.zeroListingDegraded).toBeGreaterThan(0)
    expect(DEFAULT_PARSER_HEALTH_THRESHOLDS.averageParseDurationMsFailing).toBeGreaterThan(
      DEFAULT_PARSER_HEALTH_THRESHOLDS.averageParseDurationMsDegraded
    )
  })
})

describe('classifyParserHealthFromCounts', () => {
  const baseCounts = () => ({
    total: 10,
    fixtureMismatch: 0,
    zeroListings: 0,
    selectorMissing: 0,
    malformedSourceData: 0,
    unsupportedLayout: 0,
    extractionEmpty: 0,
    normalizationFailed: 0,
    parseDurationSumMs: 0,
    parseDurationMaxMs: 0,
    duplicateSuppressed: 0,
    duplicateSuppressedExpected: 10,
  })

  it('fail-closed when total is zero', () => {
    const r = classifyParserHealthFromCounts({ ...baseCounts(), total: 0 })
    expect(r.status).toBe('failing')
    expect(r.reasons).toContain('invalid_metrics')
  })

  it('maps duplicate suppression deviation to anomaly rate', () => {
    const r = classifyParserHealthFromCounts({
      ...baseCounts(),
      duplicateSuppressed: 10,
      duplicateSuppressedExpected: 10,
    })
    expect(r.status).toBe('healthy')
  })
})
