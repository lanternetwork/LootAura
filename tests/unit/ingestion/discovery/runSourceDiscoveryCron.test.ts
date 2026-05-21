import { beforeEach, describe, expect, it, vi } from 'vitest'

const discoveryMock = vi.fn()
const promoteMock = vi.fn()
const revalidateMock = vi.fn()
const acquireMock = vi.fn()
const releaseMock = vi.fn()
const emitMock = vi.fn()

vi.mock('@/lib/ingestion/discovery/sourceDiscovery', () => ({
  runSourceDiscoveryDryRun: (...args: unknown[]) => discoveryMock(...args),
}))

vi.mock('@/lib/ingestion/discovery/promoteSourceDiscoveryResults', () => ({
  promoteSourceDiscoveryResults: (...args: unknown[]) => promoteMock(...args),
}))

vi.mock('@/lib/ingestion/discovery/revalidateSourceDiscoveryConfigs', () => ({
  revalidateSourceDiscoveryConfigs: (...args: unknown[]) => revalidateMock(...args),
}))

vi.mock('@/lib/ingestion/discovery/discoveryOrchestrationLease', () => ({
  acquireDiscoveryOrchestrationLease: (...args: unknown[]) => acquireMock(...args),
  releaseDiscoveryOrchestrationLease: (...args: unknown[]) => releaseMock(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: () => ({
    select: () => ({
      eq: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              {
                source_platform: 'external_page_source',
                source_pages: ['https://example.com/a.html'],
                source_discovery_status: 'validated',
                source_crawl_excluded_at: null,
              },
            ],
            error: null,
          }),
      }),
    }),
  }),
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
  emitObservabilityRecord: (record: unknown) => emitMock(record),
  shouldEmitTelemetryJson: () => false,
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateOperationId: () => 'op-test',
}))

describe('runSourceDiscoveryCron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    acquireMock.mockResolvedValue({
      acquired: true,
      owner: 'op-test',
      staleRecovered: false,
      stateCursor: 2,
    })
    releaseMock.mockResolvedValue(undefined)
    discoveryMock.mockResolvedValue({
      ok: true,
      statesScanned: 2,
      candidatePagesDiscovered: 5,
      candidatePagesValid: 4,
      candidatePagesInvalid: 1,
      candidates: [{ validation: { ok: true, kind: 'valid_city_page' } }],
    })
    promoteMock.mockResolvedValue({
      ok: true,
      telemetry: { configsPromoted: 2, configsRepaired: 1 },
    })
    revalidateMock.mockResolvedValue({
      ok: true,
      telemetry: {
        configsRevalidated: 3,
        configsRepaired: 1,
        configsFailed: 0,
        placeholdersUnresolved: 0,
      },
    })
  })

  it('runs discover → promote → revalidate and advances cursor', async () => {
    const { runSourceDiscoveryCron } = await import('@/lib/ingestion/discovery/runSourceDiscoveryCron')
    const result = await runSourceDiscoveryCron({} as never, {
      budgets: {
        maxStatesPerRun: 2,
        maxDiscoveredPagesPerRun: 10,
        maxValidationFetchesPerRun: 10,
        maxRevalidationConfigsPerRun: 10,
        maxPlaceholderRepairConfigsPerRun: 10,
        leaseSeconds: 120,
        maxRuntimeMs: 60_000,
        placeholderFailureExcludeThreshold: 1,
      },
    })

    expect(result.skipped).toBe(false)
    expect(discoveryMock).toHaveBeenCalledTimes(1)
    expect(promoteMock).toHaveBeenCalledTimes(1)
    expect(revalidateMock).toHaveBeenCalledTimes(2)
    expect(revalidateMock.mock.calls[0]?.[1]).toMatchObject({
      selectionMode: 'no_source_pages_only',
    })
    expect(revalidateMock.mock.calls[0]?.[1]).not.toHaveProperty('states')
    expect(releaseMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ markCompleted: true })
    )
    expect(result.telemetry.configsPromoted).toBe(2)
    expect(result.telemetry.phasesCompleted).toContain('discover')
    expect(result.telemetry.phasesCompleted).toContain('promote')
    expect(result.telemetry.phasesCompleted).toContain('placeholder_repair')
    expect(result.telemetry.phasesCompleted).toContain('revalidate')
  })

  it('skips work when overlap prevents lease acquire', async () => {
    acquireMock.mockResolvedValue({
      acquired: false,
      owner: 'op-test',
      staleRecovered: false,
      stateCursor: 2,
      reason: 'active_lease',
    })
    const { runSourceDiscoveryCron } = await import('@/lib/ingestion/discovery/runSourceDiscoveryCron')
    const result = await runSourceDiscoveryCron({} as never, {})
    expect(result.skipped).toBe(true)
    expect(result.telemetry.overlapPrevented).toBe(true)
    expect(discoveryMock).not.toHaveBeenCalled()
    expect(promoteMock).not.toHaveBeenCalled()
  })

  it('bounds discovery to configured state batch size', async () => {
    const { runSourceDiscoveryCron } = await import('@/lib/ingestion/discovery/runSourceDiscoveryCron')
    await runSourceDiscoveryCron({} as never, {
      budgets: {
        maxStatesPerRun: 2,
        maxDiscoveredPagesPerRun: 10,
        maxValidationFetchesPerRun: 10,
        maxRevalidationConfigsPerRun: 5,
        maxPlaceholderRepairConfigsPerRun: 5,
        leaseSeconds: 120,
        maxRuntimeMs: 60_000,
        placeholderFailureExcludeThreshold: 1,
      },
    })
    const discoveryArgs = discoveryMock.mock.calls[0]![0] as { states?: string[]; maxStatesPerRun: number }
    expect(discoveryArgs.maxStatesPerRun).toBe(2)
    expect(discoveryArgs.states?.length).toBeLessThanOrEqual(2)
  })
})
