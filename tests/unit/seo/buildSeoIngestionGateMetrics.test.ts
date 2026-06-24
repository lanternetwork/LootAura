import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mockCore = vi.hoisted(() => vi.fn())

vi.mock('@/app/api/admin/ingestion/metrics/route', () => ({
  buildIngestionCoreMetricsResponse: (...args: unknown[]) => mockCore(...args),
  buildIngestionFullMetricsResponse: vi.fn(),
  buildIngestionMetricsResponse: vi.fn(),
}))

describe('buildSeoIngestionGateMetrics', () => {
  it('uses core metrics builder only', async () => {
    mockCore.mockResolvedValue({ ok: true, generatedAt: new Date().toISOString() })
    const { buildSeoIngestionGateMetrics } = await import('@/lib/seo/buildSeoIngestionGateMetrics')
    await buildSeoIngestionGateMetrics()
    expect(mockCore).toHaveBeenCalledTimes(1)
  })
})

describe('SEO emission path', () => {
  it('resolveInventorySeoEmission does not import full metrics builder', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/seo/resolveInventorySeoEmission.ts'),
      'utf8'
    )
    expect(source).toContain('buildSeoIngestionGateMetrics')
    expect(source).not.toContain('buildIngestionMetricsResponse')
    expect(source).not.toContain('buildIngestionFullMetricsResponse')
  })

  it('loadSeoIndexAllowlistForAdmin does not call GET ingestion metrics', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/seo/loadSeoIndexAllowlistForAdmin.ts'),
      'utf8'
    )
    expect(source).toContain('buildSeoIngestionGateMetrics')
    expect(source).not.toContain('getIngestionMetrics')
  })
})
