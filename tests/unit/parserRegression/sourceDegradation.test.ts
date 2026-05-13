import { describe, it, expect } from 'vitest'
import { buildSourceDegradationRow, summarizeSourceDegradation } from '@/lib/parserRegression/sourceDegradation'
import type { SourceDegradationTag } from '@/lib/parserRegression/sourceDegradation'
import { defaultParserHealthThresholds, classifyParserHealthFromCounts } from '@/lib/parserRegression/parserHealth'

const th = defaultParserHealthThresholds()
const emptyTags: SourceDegradationTag[] = []

describe('buildSourceDegradationRow', () => {
  it('flags likely selector drift when selector + mismatch rates are elevated', () => {
    const counts = {
      total: 10,
      fixtureMismatch: 2,
      zeroListings: 0,
      selectorMissing: 2,
      malformedSourceData: 0,
      unsupportedLayout: 0,
      extractionEmpty: 0,
      normalizationFailed: 0,
      parseDurationSumMs: 100,
      parseDurationMaxMs: 20,
      duplicateSuppressed: 0,
    }
    const health = classifyParserHealthFromCounts(counts, th)
    const row = buildSourceDegradationRow({
      sourceHost: 'example.com',
      health,
      freshnessStatus: 'fresh',
      freshnessReasons: [],
      counts,
    })
    expect(row.tags).toContain('likely_selector_drift')
  })
})

describe('summarizeSourceDegradation', () => {
  it('partitions failing vs degraded hosts', () => {
    const out = summarizeSourceDegradation([
      {
        sourceHost: 'a.example.com',
        healthStatus: 'failing',
        freshnessStatus: 'fresh',
        tags: emptyTags,
        recommendedAction: 'x',
      },
      {
        sourceHost: 'b.example.com',
        healthStatus: 'healthy',
        freshnessStatus: 'aging',
        tags: emptyTags,
        recommendedAction: 'y',
      },
    ])
    expect(out.failingSources).toEqual(['a.example.com'])
    expect(out.degradedSources).toEqual(['b.example.com'])
  })
})
