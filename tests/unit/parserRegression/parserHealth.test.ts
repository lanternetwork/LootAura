import { describe, it, expect } from 'vitest'
import {
  classifyParserHealthFromCounts,
  defaultParserHealthThresholds,
} from '@/lib/parserRegression/parserHealth'

const T = () => defaultParserHealthThresholds()

describe('classifyParserHealthFromCounts', () => {
  it('fails closed on invalid totals', () => {
    const r = classifyParserHealthFromCounts(
      {
        total: 0,
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
      },
      T()
    )
    expect(r.status).toBe('failing')
    expect(r.reasons).toContain('invalid_metrics')
  })

  it('is deterministic for identical inputs', () => {
    const counts = {
      total: 20,
      fixtureMismatch: 1,
      zeroListings: 2,
      selectorMissing: 0,
      malformedSourceData: 0,
      unsupportedLayout: 0,
      extractionEmpty: 0,
      normalizationFailed: 0,
      parseDurationSumMs: 400,
      parseDurationMaxMs: 80,
      duplicateSuppressed: 0,
    }
    const a = classifyParserHealthFromCounts(counts, T())
    const b = classifyParserHealthFromCounts(counts, T())
    expect(a).toEqual(b)
  })

  it('marks failing when mismatch rate crosses failing threshold', () => {
    const r = classifyParserHealthFromCounts(
      {
        total: 10,
        fixtureMismatch: 5,
        zeroListings: 0,
        selectorMissing: 0,
        malformedSourceData: 0,
        unsupportedLayout: 0,
        extractionEmpty: 0,
        normalizationFailed: 0,
        parseDurationSumMs: 100,
        parseDurationMaxMs: 20,
        duplicateSuppressed: 0,
      },
      T()
    )
    expect(r.status).toBe('failing')
    expect(r.reasons).toContain('high_fixture_mismatch_rate')
  })
})
