import { beforeEach, describe, expect, it, vi } from 'vitest'

const graphEnumerationMock = vi.fn()
const promoteMock = vi.fn()
const revalidateMock = vi.fn()
const acquireMock = vi.fn()
const releaseMock = vi.fn()
const emitMock = vi.fn()
const listBacklogMock = vi.fn()
const markPromotedMock = vi.fn()

vi.mock('@/lib/ingestion/discovery/runYstmGraphEnumerationDiscovery', () => ({
  runYstmGraphEnumerationDiscovery: (...args: unknown[]) => graphEnumerationMock(...args),
}))

vi.mock('@/lib/ingestion/estatesalesnet/esnetDiscoveryCadence', () => ({
  shouldRunEsnetDiscoveryThisInvocation: () => false,
}))

vi.mock('@/lib/ingestion/estatesalesnet/discovery/runEsnetGraphEnumerationDiscovery', () => ({
  runEsnetGraphEnumerationDiscovery: vi.fn().mockResolvedValue({
    ok: true,
    promotable: [],
    telemetry: {
      statesScanned: 0,
      candidatePagesDiscovered: 0,
      candidatePagesValid: 0,
      candidatePagesInvalid: 0,
      candidateRegistryUpserts: 0,
      validationsAttempted: 0,
      configsPromoted: 0,
    },
  }),
}))

vi.mock('@/lib/ingestion/discovery/ystmSourcePageCandidatesStore', () => ({
  listValidatedUnpromotedCandidates: (...args: unknown[]) => listBacklogMock(...args),
  markSourcePageCandidatesPromoted: (...args: unknown[]) => markPromotedMock(...args),
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
    listBacklogMock.mockResolvedValue([])
    markPromotedMock.mockResolvedValue(undefined)
    graphEnumerationMock.mockResolvedValue({
      ok: true,
      promotable: [
        {
          city: 'Austin',
          state: 'TX',
          statePathSegment: 'TX',
          canonicalUrl: 'https://yardsaletreasuremap.com/TX/austin.html',
          sharedHubPage: false,
          cityPathSegment: 'austin.html',
          validation: { ok: true, kind: 'valid_city_page' },
        },
      ],
      telemetry: {
        statesScanned: 2,
        candidatePagesDiscovered: 5,
        candidateRegistryUpserts: 3,
        candidatePagesValid: 4,
        candidatePagesInvalid: 1,
        validationsAttempted: 5,
        fetchFailures: 0,
        blockedCount: 0,
        throttleApplied: false,
        throttleReasons: [],
        backlogValidationsProcessed: 5,
      },
    })
    promoteMock.mockResolvedValue({
      ok: true,
      telemetry: { configsPromoted: 2, configsRepaired: 1 },
      records: [
        {
          canonicalUrl: 'https://yardsaletreasuremap.com/TX/austin.html',
          configId: 'cfg-1',
          action: 'updated',
        },
      ],
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

  it('runs placeholder repair → graph enumeration → promote → revalidate', async () => {
    const { runSourceDiscoveryCron } = await import('@/lib/ingestion/discovery/runSourceDiscoveryCron')
    const result = await runSourceDiscoveryCron({} as never, {
      budgets: {
        maxStatesPerRun: 2,
        maxDiscoveredPagesPerRun: 10,
        maxValidationFetchesPerRun: 10,
        maxRevalidationConfigsPerRun: 10,
        maxPlaceholderRepairConfigsPerRun: 10,
        indexFetchConcurrency: 2,
        validationFetchConcurrency: 2,
        leaseSeconds: 120,
        maxRuntimeMs: 60_000,
        placeholderFailureExcludeThreshold: 1,
      },
    })

    expect(result.skipped).toBe(false)
    expect(revalidateMock).toHaveBeenCalledTimes(2)
    expect(revalidateMock.mock.calls[0]?.[1]).toMatchObject({
      selectionMode: 'no_source_pages_only',
    })
    expect(graphEnumerationMock).toHaveBeenCalledTimes(1)
    expect(promoteMock).toHaveBeenCalledTimes(1)
    const placeholderCallOrder = revalidateMock.mock.invocationCallOrder[0] ?? 0
    const graphCallOrder = graphEnumerationMock.mock.invocationCallOrder[0] ?? 0
    expect(placeholderCallOrder).toBeLessThan(graphCallOrder)
    const promoteCallOrder = promoteMock.mock.invocationCallOrder[0] ?? 0
    // Empty backlog: early promote is a no-op; graph candidates promote after graph.
    expect(promoteCallOrder).toBeGreaterThan(graphCallOrder)
    expect(revalidateMock.mock.calls[0]?.[1]).not.toHaveProperty('states')
    expect(releaseMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ markCompleted: true })
    )
    expect(result.telemetry.configsPromoted).toBe(2)
    expect(result.telemetry.phasesCompleted).toContain('graph_enumeration')
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
    expect(graphEnumerationMock).not.toHaveBeenCalled()
    expect(promoteMock).not.toHaveBeenCalled()
  })

  it('promotes registry backlog before graph enumeration when backlog exists', async () => {
    listBacklogMock.mockResolvedValue([
      {
        state: 'TX',
        city_slug: 'dallas',
        canonical_url: 'https://yardsaletreasuremap.com/US/Texas/dallas.html',
        metadata: { city: 'Dallas', sharedHubPage: false },
      },
    ])

    const { runSourceDiscoveryCron } = await import('@/lib/ingestion/discovery/runSourceDiscoveryCron')
    await runSourceDiscoveryCron({} as never, {
      budgets: {
        maxStatesPerRun: 2,
        maxDiscoveredPagesPerRun: 10,
        maxValidationFetchesPerRun: 10,
        maxRevalidationConfigsPerRun: 10,
        maxPlaceholderRepairConfigsPerRun: 10,
        indexFetchConcurrency: 2,
        validationFetchConcurrency: 2,
        leaseSeconds: 120,
        maxRuntimeMs: 60_000,
        placeholderFailureExcludeThreshold: 1,
      },
    })

    expect(promoteMock.mock.invocationCallOrder[0]!).toBeLessThan(
      graphEnumerationMock.mock.invocationCallOrder[0]!
    )
    expect(promoteMock).toHaveBeenCalledTimes(2)
  })

  it('promotes registry backlog when graph enumeration fails', async () => {
    graphEnumerationMock.mockResolvedValueOnce({
      ok: false,
      promotable: [],
      telemetry: {
        statesScanned: 0,
        candidatePagesDiscovered: 0,
        candidateRegistryUpserts: 0,
        candidatePagesValid: 0,
        candidatePagesInvalid: 0,
        validationsAttempted: 0,
        fetchFailures: 1,
        blockedCount: 0,
        throttleApplied: false,
        throttleReasons: [],
        backlogValidationsProcessed: 0,
      },
      error: 'fetch_failed',
    })
    listBacklogMock.mockResolvedValueOnce([
      {
        state: 'TX',
        city_slug: 'austin',
        canonical_url: 'https://yardsaletreasuremap.com/US/Texas/austin.html',
        metadata: { city: 'Austin', sharedHubPage: false },
      },
    ])

    const { runSourceDiscoveryCron } = await import('@/lib/ingestion/discovery/runSourceDiscoveryCron')
    const result = await runSourceDiscoveryCron({} as never, {
      budgets: {
        maxStatesPerRun: 2,
        maxDiscoveredPagesPerRun: 10,
        maxValidationFetchesPerRun: 10,
        maxRevalidationConfigsPerRun: 10,
        maxPlaceholderRepairConfigsPerRun: 10,
        indexFetchConcurrency: 2,
        validationFetchConcurrency: 2,
        leaseSeconds: 120,
        maxRuntimeMs: 60_000,
        placeholderFailureExcludeThreshold: 1,
      },
    })

    expect(result.telemetry.phasesCompleted).toContain('graph_enumeration')
    expect(result.telemetry.phasesCompleted).toContain('promote')
    expect(promoteMock).toHaveBeenCalledTimes(1)
    const promoted = promoteMock.mock.calls[0]![1] as { candidates: Array<{ canonicalUrl: string }> }
    expect(promoted.candidates.some((c) => c.canonicalUrl.includes('austin.html'))).toBe(true)
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
        indexFetchConcurrency: 2,
        validationFetchConcurrency: 2,
        leaseSeconds: 120,
        maxRuntimeMs: 60_000,
        placeholderFailureExcludeThreshold: 1,
      },
    })
    const graphArgs = graphEnumerationMock.mock.calls[0]![1] as {
      stateCodes: string[]
      budgets: { maxStatesPerRun: number }
    }
    expect(graphArgs.budgets.maxStatesPerRun).toBe(2)
    expect(graphArgs.stateCodes.length).toBeLessThanOrEqual(2)
  })
})
