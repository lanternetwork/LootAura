import { describe, expect, it } from 'vitest'
import {
  defaultFixtureFreshnessThresholdsMs,
  evaluateFixtureFreshness,
  validateFixtureFreshnessMetadata,
  validateParserFixtureMetadataJson,
} from '@/lib/parserRegression/fixtureFreshness'

describe('validateFixtureFreshnessMetadata', () => {
  it('rejects missing captured_at', () => {
    const r = validateFixtureFreshnessMetadata({ source_host: 'example.com' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => e.includes('captured_at'))).toBe(true)
  })

  it('rejects invalid captured_at', () => {
    const r = validateFixtureFreshnessMetadata({
      captured_at: 'not-a-date',
      source_host: 'example.com',
    })
    expect(r.ok).toBe(false)
  })

  it('accepts minimal valid metadata', () => {
    const r = validateFixtureFreshnessMetadata({
      captured_at: '2026-01-01T00:00:00.000Z',
      source_host: 'Example.COM',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.source_host).toBe('example.com')
  })
})

describe('validateParserFixtureMetadataJson', () => {
  it('rejects missing captured_at', () => {
    const r = validateParserFixtureMetadataJson({
      source_host: 'example.com',
      pageUrl: 'https://example.com/x',
      config: { city: 'A', state: 'IL', source_platform: 'x', source_pages: [] },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => e.includes('captured_at'))).toBe(true)
  })

  it('rejects source_host with path', () => {
    const r = validateParserFixtureMetadataJson({
      captured_at: '2026-01-01T00:00:00.000Z',
      source_host: 'example.com/foo',
      pageUrl: 'https://example.com/x',
      config: { city: 'A', state: 'IL', source_platform: 'x', source_pages: [] },
    })
    expect(r.ok).toBe(false)
  })

  it('accepts valid harness metadata', () => {
    const r = validateParserFixtureMetadataJson({
      captured_at: '2026-01-01T00:00:00.000Z',
      source_host: 'example.com',
      pageUrl: 'https://example.com/x',
      config: { city: 'A', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
    })
    expect(r.ok).toBe(true)
  })
})

describe('evaluateFixtureFreshness', () => {
  const thresholds = defaultFixtureFreshnessThresholdsMs()

  it('classifies fresh under aging threshold', () => {
    const ref = new Date('2026-05-01T12:00:00.000Z').getTime()
    const r = evaluateFixtureFreshness('2026-04-20T12:00:00.000Z', ref, thresholds)
    expect(r.status).toBe('fresh')
    expect(r.reasons).toEqual([])
  })

  it('classifies aging between thresholds (boundary on aging)', () => {
    const captured = new Date('2026-01-01T12:00:00.000Z').getTime()
    const now = captured + thresholds.agingAfterMs
    const r = evaluateFixtureFreshness(new Date(captured).toISOString(), now, thresholds)
    expect(r.status).toBe('aging')
    expect(r.reasons).toContain('fixture_age_exceeds_aging_threshold')
  })

  it('classifies fresh just below aging threshold', () => {
    const captured = new Date('2026-01-01T12:00:00.000Z').getTime()
    const now = captured + Math.max(0, thresholds.agingAfterMs - 1000)
    const r = evaluateFixtureFreshness(new Date(captured).toISOString(), now, thresholds)
    expect(r.status).toBe('fresh')
  })

  it('classifies stale beyond stale threshold', () => {
    const captured = new Date('2025-01-01T12:00:00.000Z').getTime()
    const now = captured + thresholds.staleAfterMs
    const r = evaluateFixtureFreshness(new Date(captured).toISOString(), now, thresholds)
    expect(r.status).toBe('stale')
    expect(r.reasons).toContain('fixture_age_exceeds_stale_threshold')
  })

  it('fail-closed invalid thresholds', () => {
    const ref = 1_735_689_600_000
    const r = evaluateFixtureFreshness('2026-01-01T00:00:00.000Z', ref, {
      agingAfterMs: 100,
      staleAfterMs: 50,
    })
    expect(r.status).toBe('stale')
    expect(r.reasons).toContain('invalid_thresholds')
  })

  it('fail-closed invalid reference clock', () => {
    const r = evaluateFixtureFreshness('2026-01-01T00:00:00.000Z', Number.NaN, thresholds)
    expect(r.status).toBe('stale')
    expect(r.reasons).toContain('invalid_metadata')
  })

  it('fail-closed invalid captured_at ISO', () => {
    const r = evaluateFixtureFreshness('bogus', 1_735_689_600_000, thresholds)
    expect(r.status).toBe('stale')
    expect(r.reasons).toContain('invalid_captured_at')
  })
})
