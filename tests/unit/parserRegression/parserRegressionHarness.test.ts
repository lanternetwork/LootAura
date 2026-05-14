import * as fs from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadParserFixture } from '@/lib/parserRegression/parserRegressionHarness'

describe('parserRegressionHarness loadParserFixture', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when captured_at is missing (freshness + harness validation)', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('metadata.json')) {
        return JSON.stringify({
          source_host: 'a.example',
          pageUrl: 'https://a.example/p',
          config: { city: 'x', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        })
      }
      if (s.endsWith('raw.html')) return '<html></html>'
      if (s.endsWith('expected.json')) return '{}'
      return ''
    })
    expect(() => loadParserFixture('adapter', 'case1')).toThrow(/captured_at/i)
  })

  it('throws when source_host is missing', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('metadata.json')) {
        return JSON.stringify({
          captured_at: '2026-01-01T00:00:00.000Z',
          pageUrl: 'https://a.example/p',
          config: { city: 'x', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
        })
      }
      if (s.endsWith('raw.html')) return '<html></html>'
      if (s.endsWith('expected.json')) return '{}'
      return ''
    })
    expect(() => loadParserFixture('adapter', 'case1')).toThrow(/source_host/i)
  })

  it('throws when harness-required pageUrl or config is invalid after freshness passes', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('metadata.json')) {
        return JSON.stringify({
          captured_at: '2026-01-01T00:00:00.000Z',
          source_host: 'a.example',
        })
      }
      if (s.endsWith('raw.html')) return '<html></html>'
      if (s.endsWith('expected.json')) return '{}'
      return ''
    })
    expect(() => loadParserFixture('adapter', 'case1')).toThrow(/pageUrl|config/i)
  })
})
