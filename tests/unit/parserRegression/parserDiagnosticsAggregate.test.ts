import { describe, expect, it } from 'vitest'
import {
  buildParserHealthAdminApiResponse,
  buildParserHealthDiagnosticsPayload,
} from '@/lib/parserRegression/parserDiagnosticsAggregate'
import type { ScannedParserFixtureError, ScannedParserFixtureRecord } from '@/lib/parserRegression/parserFixtureScan'

describe('buildParserHealthDiagnosticsPayload', () => {
  it('aggregates by source_host', () => {
    const fixtures: ScannedParserFixtureRecord[] = [
      {
        sourceDir: 'x',
        caseId: 'a',
        metadata: {
          captured_at: '2026-04-01T00:00:00.000Z',
          source_host: 'one.test',
          pageUrl: 'https://one.test/p',
          config: { city: 'A', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        },
      },
      {
        sourceDir: 'x',
        caseId: 'b',
        metadata: {
          captured_at: '2026-04-02T00:00:00.000Z',
          source_host: 'one.test',
          pageUrl: 'https://one.test/q',
          config: { city: 'A', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        },
      },
    ]
    const ref = new Date('2026-05-01T00:00:00.000Z').getTime()
    const p = buildParserHealthDiagnosticsPayload({
      evaluatedAtMs: ref,
      fixtures,
      invalid: [],
    })
    expect(p.sources).toHaveLength(1)
    expect(p.sources[0].fixtureCount).toBe(2)
    expect(p.sources[0].sourceHost).toBe('one.test')
    expect(p.sources[0].parserStatus).toBe('healthy')
    expect(p.sources[0].healthStatus).toBe('healthy')
  })

  it('orders sources by hostname deterministically', () => {
    const fixtures: ScannedParserFixtureRecord[] = [
      {
        sourceDir: 'x',
        caseId: 'z',
        metadata: {
          captured_at: '2026-04-01T00:00:00.000Z',
          source_host: 'z.test',
          pageUrl: 'https://z.test/p',
          config: { city: 'A', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        },
      },
      {
        sourceDir: 'x',
        caseId: 'a',
        metadata: {
          captured_at: '2026-04-02T00:00:00.000Z',
          source_host: 'a.test',
          pageUrl: 'https://a.test/p',
          config: { city: 'A', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        },
      },
    ]
    const ref = new Date('2026-05-01T00:00:00.000Z').getTime()
    const p = buildParserHealthDiagnosticsPayload({
      evaluatedAtMs: ref,
      fixtures,
      invalid: [],
    })
    expect(p.sources.map((s) => s.sourceHost)).toEqual(['a.test', 'z.test'])
  })

  it('buildParserHealthAdminApiResponse exposes only safe aggregate fields', () => {
    const fixtures: ScannedParserFixtureRecord[] = [
      {
        sourceDir: 'x',
        caseId: 'a',
        metadata: {
          captured_at: '2026-04-01T00:00:00.000Z',
          source_host: 'one.test',
          pageUrl: 'https://one.test/p',
          config: { city: 'A', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        },
      },
    ]
    const ref = new Date('2026-05-01T00:00:00.000Z').getTime()
    const p = buildParserHealthDiagnosticsPayload({
      evaluatedAtMs: ref,
      fixtures,
      invalid: [],
    })
    const api = buildParserHealthAdminApiResponse(p)
    const json = JSON.stringify(api)
    expect(json).not.toMatch(/pageHostHash/)
    expect(json).not.toMatch(/https?:\/\//)
    expect(api.sources[0]).not.toHaveProperty('pageHostHash')
    expect(api.sources[0]).toHaveProperty('parserStatus')
    expect(api.sources[0]).toHaveProperty('reasons')
    expect(api.summary).toEqual({
      healthy: expect.any(Number),
      degraded: expect.any(Number),
      failing: expect.any(Number),
    })
  })

  it('marks host failing when fixture metadata invalid cases exist for that host', () => {
    const fixtures: ScannedParserFixtureRecord[] = [
      {
        sourceDir: 'x',
        caseId: 'a',
        metadata: {
          captured_at: '2026-04-01T00:00:00.000Z',
          source_host: 'bad.example',
          pageUrl: 'https://bad.example/p',
          config: { city: 'A', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        },
      },
    ]
    const invalid: ScannedParserFixtureError[] = [
      {
        sourceDir: 'x',
        caseId: 'broken',
        errors: ['captured_at is required'],
        sourceHostHint: 'bad.example',
      },
    ]
    const ref = new Date('2026-05-01T00:00:00.000Z').getTime()
    const p = buildParserHealthDiagnosticsPayload({
      evaluatedAtMs: ref,
      fixtures,
      invalid,
    })
    const row = p.sources.find((s) => s.sourceHost === 'bad.example')
    expect(row).toBeDefined()
    expect(row!.invalidFixtureCount).toBe(1)
    expect(row!.parserStatus).toBe('healthy')
    expect(row!.healthStatus).toBe('failing')
    expect(row!.reasonList).toContain('fixture_metadata_invalid')
    expect(p.degradation.failingSources).toContain('bad.example')
  })
})
