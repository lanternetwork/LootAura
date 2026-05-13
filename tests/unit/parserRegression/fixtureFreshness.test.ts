import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultFixtureFreshnessThresholds,
  evaluateFixtureFreshness,
  validateParserFixtureMetadata,
} from '@/lib/parserRegression/fixtureFreshness'

describe('validateParserFixtureMetadata', () => {
  it('requires captured_at and source_host', () => {
    expect(validateParserFixtureMetadata({ pageUrl: 'https://a.com/x', config: {} }).ok).toBe(false)
    expect(
      validateParserFixtureMetadata({
        pageUrl: 'https://a.com/x',
        config: { x: 1 },
        captured_at: 'not-a-date',
        source_host: 'example.com',
      }).ok
    ).toBe(false)
    expect(
      validateParserFixtureMetadata({
        pageUrl: 'https://a.com/x',
        config: { x: 1 },
        captured_at: '2026-01-01T00:00:00.000Z',
        source_host: 'not a host',
      }).ok
    ).toBe(false)
  })

  it('accepts well-formed metadata', () => {
    const r = validateParserFixtureMetadata({
      pageUrl: 'https://example.com/list',
      config: { source_platform: 'external_page_source' },
      captured_at: '2026-04-01T00:00:00.000Z',
      source_host: 'example.com',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.metadata.sourceHost).toBe('example.com')
    }
  })
})

describe('evaluateFixtureFreshness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('classifies stale beyond aging threshold', () => {
    const th = defaultFixtureFreshnessThresholds()
    const captured = new Date('2025-01-01T00:00:00.000Z').getTime()
    const r = evaluateFixtureFreshness(captured, Date.now(), th)
    expect(r.status).toBe('stale')
    expect(r.reasons).toContain('fixture_age_stale')
  })

  it('classifies fresh within fresh window', () => {
    const th = defaultFixtureFreshnessThresholds()
    const captured = new Date('2026-05-15T00:00:00.000Z').getTime()
    const r = evaluateFixtureFreshness(captured, Date.now(), th)
    expect(r.status).toBe('fresh')
    expect(r.reasons).toEqual([])
  })
})
