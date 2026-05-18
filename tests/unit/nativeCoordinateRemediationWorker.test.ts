import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  fetchHtml: vi.fn(),
  lookupSpatial: vi.fn(),
  applySuccess: vi.fn(),
  updatePayloads: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({ rpc: hoisted.adminRpc })),
  fromBase: vi.fn(() => ({
    update: (payload: Record<string, unknown>) => {
      hoisted.updatePayloads.push(payload)
      return {
        eq: async () => ({ error: null }),
      }
    },
  })),
}))

vi.mock('@/lib/ingestion/adapters/externalPageSafeFetch', () => ({
  fetchSafeExternalPageHtml: hoisted.fetchHtml,
}))

vi.mock('@/lib/ingestion/spatial/resolveSpatialCoordinates', () => ({
  lookupSpatialCoordinates: hoisted.lookupSpatial,
}))

vi.mock('@/lib/ingestion/spatial/applyNativeCoordinateSuccess', () => ({
  applyNativeCoordinateSuccess: hoisted.applySuccess,
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, payload: Record<string, unknown>) => ({ event, payload }),
  emitObservabilityRecord: vi.fn(),
}))

const ROW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'

const claimedRow = {
  id: ROW_ID,
  source_url: DETAIL_URL,
  address_raw: '4443 S St Louis Ave, Chicago, IL',
  normalized_address: null,
  city: 'Chicago',
  state: 'IL',
  status: 'needs_geocode',
  native_coord_attempts: 1,
  failure_details: null,
}

describe('runNativeCoordinateRemediation', () => {
  beforeEach(() => {
    vi.resetModules()
    hoisted.adminRpc.mockReset()
    hoisted.fetchHtml.mockReset()
    hoisted.lookupSpatial.mockReset()
    hoisted.applySuccess.mockReset()
    hoisted.updatePayloads.length = 0
  })

  it('claims via RPC and promotes on native success with cache upsert path', async () => {
    hoisted.adminRpc.mockResolvedValue({ data: [claimedRow], error: null })
    hoisted.lookupSpatial
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        lat: 41.78,
        lng: -87.7,
        geocode_confidence: 'high',
        coordinate_precision: 'provider_native',
        geocode_method: 'ystm_provider_native',
        resolutionSource: 'ystm_provider_native',
      })
    hoisted.fetchHtml.mockResolvedValue('<html>const lat = 41.78; const lng = -87.7;</html>')
    hoisted.applySuccess.mockResolvedValue({ kind: 'promoted', published: true })

    const { runNativeCoordinateRemediation } = await import('@/lib/ingestion/nativeCoordinateRemediationWorker')
    const summary = await runNativeCoordinateRemediation({ batchSizeOverride: 5 })

    expect(hoisted.adminRpc).toHaveBeenCalledWith(
      'claim_ingested_sales_for_native_coordinate_remediation',
      expect.objectContaining({ p_batch_size: 5, p_max_attempts: 5 })
    )
    expect(summary.claimed).toBe(1)
    expect(summary.promoted).toBe(1)
    expect(hoisted.applySuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        rowId: ROW_ID,
        priorStatus: 'needs_geocode',
      })
    )
  })

  it('schedules retry with cooldown on retryable fetch failure', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [{ ...claimedRow, native_coord_attempts: 2 }],
      error: null,
    })
    hoisted.lookupSpatial.mockResolvedValue(null)
    hoisted.fetchHtml.mockRejectedValue(new Error('http_error: 429'))

    const { runNativeCoordinateRemediation } = await import('@/lib/ingestion/nativeCoordinateRemediationWorker')
    const summary = await runNativeCoordinateRemediation({ batchSizeOverride: 5 })

    expect(summary.retryScheduled).toBe(1)
    expect(hoisted.applySuccess).not.toHaveBeenCalled()
    expect(hoisted.updatePayloads.length).toBeGreaterThan(0)
    expect(hoisted.updatePayloads[0]).toMatchObject({
      native_coord_failure_reason: 'fetch_rate_limited',
      native_coord_next_attempt_at: expect.any(String),
    })
  })

  it('falls back to needs_geocode after terminal native failure at max attempts', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [{ ...claimedRow, native_coord_attempts: 5 }],
      error: null,
    })
    hoisted.lookupSpatial.mockResolvedValue(null)
    hoisted.fetchHtml.mockResolvedValue('<html>no coords here</html>')

    const { runNativeCoordinateRemediation } = await import('@/lib/ingestion/nativeCoordinateRemediationWorker')
    const summary = await runNativeCoordinateRemediation({ batchSizeOverride: 5 })

    expect(summary.fallbackToGeocode).toBe(1)
    expect(hoisted.updatePayloads.length).toBeGreaterThan(0)
    expect(hoisted.updatePayloads.at(-1)).toMatchObject({
      native_coord_failure_reason: 'terminal_no_coords',
    })
  })
})
