import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runYstmDiscoveryDryRun } from '@/lib/ingestion/discovery/ystmDiscovery'

const emitMock = vi.fn()

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
  emitObservabilityRecord: (record: unknown) => emitMock(record),
  shouldEmitTelemetryJson: () => false,
}))

const FIXTURES = join(process.cwd(), 'tests/fixtures/ingestion/discovery')

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

function fixtureFetch(url: string): string {
  const u = new URL(url)
  const path = u.pathname
  if (path === '/US/Illinois/') return loadFixture('state_index_illinois_dir.html')
  if (path === '/US/Indiana/') return loadFixture('state_index_indiana_dir_snippet.html')
  if (path.endsWith('/Munster.html')) return loadFixture('city_page_with_listings.html')
  if (path.endsWith('/Chicago.html')) return loadFixture('city_page_chicago_hub.html')
  if (path.endsWith('/Oak-Brook.html')) return loadFixture('city_page_valid_empty.html')
  if (path.endsWith('/Alton.html')) return loadFixture('malformed_page.html')
  if (path.endsWith('.html')) return loadFixture('city_page_with_listings.html')
  throw new Error(`unexpected_fetch:${path}`)
}

describe('runYstmDiscoveryDryRun', () => {
  beforeEach(() => {
    emitMock.mockClear()
  })

  it('dry-run discovers and validates without DB access', async () => {
    const result = await runYstmDiscoveryDryRun({
      dryRun: true,
      states: ['IN'],
      maxStatesPerRun: 1,
      maxDiscoveredPagesPerRun: 10,
      maxValidationFetchesPerRun: 10,
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.ok).toBe(true)
    expect(result.dryRun).toBe(true)
    expect(result.statesScanned).toBe(1)
    expect(result.candidatePagesDiscovered).toBe(3)
    expect(result.candidatePagesValid).toBeGreaterThanOrEqual(2)
    expect(result.candidates.some((c) => c.city === 'Munster' && c.validation.ok)).toBe(true)
    expect(emitMock).toHaveBeenCalled()
    const events = emitMock.mock.calls.map((c) => (c[0] as { event: string }).event)
    expect(events).toContain('source.discovery.run_started')
    expect(events).toContain('source.discovery.run_completed')
    expect(events.some((e) => e.includes('page_validated') || e.includes('validation_failed'))).toBe(
      true
    )
  })

  it('does not include raw URLs in telemetry payloads', async () => {
    await runYstmDiscoveryDryRun({
      states: ['IN'],
      maxStatesPerRun: 1,
      maxDiscoveredPagesPerRun: 2,
      maxValidationFetchesPerRun: 2,
      fetchHtml: async (url) => fixtureFetch(url),
    })

    const serialized = JSON.stringify(emitMock.mock.calls)
    expect(serialized).not.toContain('yardsaletreasuremap.com/US/Indiana/Munster.html')
    expect(serialized).toMatch(/pageUrlHash/)
  })

  it('counts invalid validation separately', async () => {
    const result = await runYstmDiscoveryDryRun({
      states: ['IL'],
      maxStatesPerRun: 1,
      maxDiscoveredPagesPerRun: 5,
      maxValidationFetchesPerRun: 5,
      fetchHtml: async (url) => fixtureFetch(url),
    })

    expect(result.candidatePagesInvalid).toBeGreaterThanOrEqual(1)
    const alton = result.candidates.find((c) => c.city === 'Alton')
    expect(alton?.validation.ok).toBe(false)
  })

  it('fail closed when fetch throws', async () => {
    const result = await runYstmDiscoveryDryRun({
      states: ['IL'],
      fetchHtml: async () => {
        throw new Error('fetch_failed')
      },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('fetch_failed')
    expect(result.candidates).toEqual([])
  })
})
