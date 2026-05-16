import { describe, expect, it } from 'vitest'
import {
  buildSourceDegradationRow,
  combineParserHealthAndFreshness,
  detectSourceDegradation,
  rollupWorstFixtureFreshness,
  summarizeSourceDegradation,
  type SourceParserHealthBundle,
} from '@/lib/parserRegression/sourceDegradation'
import type { ParserHealthCounts, ParserHealthResult } from '@/lib/parserRegression/parserHealth'

function bundle(
  host: string,
  parser: ParserHealthResult,
  fresh: 'fresh' | 'aging' | 'stale',
  invalid = false
): SourceParserHealthBundle {
  return {
    sourceHost: host,
    parserHealth: parser,
    worstFixtureFreshness: fresh,
    hasInvalidFixtureMetadata: invalid,
    fixtureCount: 2,
  }
}

const emptyCounts = (): ParserHealthCounts => ({
  total: 1,
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
  duplicateSuppressedExpected: 0,
})

describe('rollupWorstFixtureFreshness', () => {
  it('returns stale if any stale', () => {
    expect(rollupWorstFixtureFreshness(['fresh', 'aging', 'stale'])).toBe('stale')
  })
})

describe('combineParserHealthAndFreshness', () => {
  it('invalid metadata forces failing', () => {
    const p: ParserHealthResult = { status: 'healthy', score: 100, reasons: [] }
    expect(combineParserHealthAndFreshness(p, 'fresh', true)).toBe('failing')
  })

  it('stale fixture degrades healthy parser', () => {
    const p: ParserHealthResult = { status: 'healthy', score: 100, reasons: [] }
    expect(combineParserHealthAndFreshness(p, 'stale', false)).toBe('degraded')
  })
})

describe('detectSourceDegradation', () => {
  it('is deterministic', () => {
    const bundles: SourceParserHealthBundle[] = [
      bundle(
        'a.example',
        { status: 'degraded', score: 60, reasons: ['high_selector_missing_rate'] },
        'fresh'
      ),
      bundle('b.example', { status: 'healthy', score: 100, reasons: [] }, 'fresh'),
    ]
    expect(detectSourceDegradation(bundles)).toEqual(detectSourceDegradation(bundles))
  })

  it('lists failing sources', () => {
    const out = detectSourceDegradation([
      bundle('x.example', { status: 'failing', score: 10, reasons: ['invalid_metrics'] }, 'fresh'),
    ])
    expect(out.failingSources).toContain('x.example')
    expect(out.recommendedAction).not.toBe('none')
  })

  it('classifies selector drift vs outage vs layout vs collapse from reasons', () => {
    const out = detectSourceDegradation([
      bundle(
        'sel.example',
        { status: 'degraded', score: 50, reasons: ['high_selector_missing_rate'] },
        'fresh'
      ),
      bundle(
        'out.example',
        { status: 'degraded', score: 50, reasons: ['high_zero_listing_rate'] },
        'fresh'
      ),
      bundle(
        'lay.example',
        { status: 'degraded', score: 50, reasons: ['high_unsupported_layout_rate'] },
        'fresh'
      ),
      bundle(
        'col.example',
        { status: 'degraded', score: 50, reasons: ['high_malformed_source_rate'] },
        'fresh'
      ),
    ])
    expect(out.likelySelectorDriftHosts).toContain('sel.example')
    expect(out.likelySourceOutageHosts).toContain('out.example')
    expect(out.likelyUnsupportedLayoutHosts).toContain('lay.example')
    expect(out.likelyExtractionCollapseHosts).toContain('col.example')
  })
})

describe('buildSourceDegradationRow', () => {
  it('tags metadata-invalid host', () => {
    const row = buildSourceDegradationRow({
      sourceHost: '__invalid_metadata__',
      health: { status: 'healthy', score: 100, reasons: [] },
      freshnessStatus: 'fresh',
      freshnessReasons: [],
      counts: emptyCounts(),
    })
    expect(row.tags).toContain('metadata_invalid')
  })
})

describe('summarizeSourceDegradation', () => {
  it('aggregates failing vs degraded using fixture freshness + health', () => {
    const s = summarizeSourceDegradation([
      {
        sourceHost: 'a.example',
        healthStatus: 'healthy',
        freshnessStatus: 'stale',
        tags: ['fixture_freshness'],
        recommendedAction: 'refresh_fixtures',
      },
      {
        sourceHost: 'b.example',
        healthStatus: 'degraded',
        freshnessStatus: 'fresh',
        tags: [],
        recommendedAction: 'refresh_fixtures',
      },
    ])
    expect(s.failingSources).toContain('a.example')
    expect(s.degradedSources).toContain('b.example')
  })
})
