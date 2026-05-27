import { beforeEach, describe, expect, it, vi } from 'vitest'

const countMock = vi.fn()
const emitMock = vi.fn()

vi.mock('@/lib/admin/duplicateCanonicalPublishClusters', () => ({
  countDuplicatePublishedCanonicalClusters: (...args: unknown[]) => countMock(...args),
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
  emitObservabilityRecord: (...args: unknown[]) => emitMock(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

describe('runDuplicateCanonicalPublishSloCron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok when cluster count is zero', async () => {
    countMock.mockResolvedValue(0)
    const { runDuplicateCanonicalPublishSloCron } = await import(
      '@/lib/ingestion/identity/runDuplicateCanonicalPublishSloCron'
    )
    const result = await runDuplicateCanonicalPublishSloCron()
    expect(result.sloMet).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.duplicateClusterCount).toBe(0)
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ingestion.convergence.duplicate_canonical_publish_slo_check',
        sloMet: true,
        alert: 'none',
      })
    )
  })

  it('returns not ok and emits alert when clusters exist', async () => {
    countMock.mockResolvedValue(2)
    const { runDuplicateCanonicalPublishSloCron } = await import(
      '@/lib/ingestion/identity/runDuplicateCanonicalPublishSloCron'
    )
    const result = await runDuplicateCanonicalPublishSloCron()
    expect(result.sloMet).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.duplicateClusterCount).toBe(2)
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sloMet: false,
        alert: 'duplicate_canonical_publish_clusters',
      })
    )
  })
})
