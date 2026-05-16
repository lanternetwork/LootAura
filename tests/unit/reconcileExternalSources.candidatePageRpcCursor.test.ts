import { describe, expect, it, vi, beforeEach } from 'vitest'

const sharedIngestRecord = (): Record<string, unknown> => ({
  id: 'ing-1',
  source_url: 'https://estatesales.net/foo',
  source_platform: 'external_page_source',
  city: 'Oak Lawn',
  state: 'IL',
  normalized_address: '1 Main St',
  zip_code: '60453',
  lat: 41.72,
  lng: -87.75,
  title: 'Before title unique',
  description: 'Before description unique content for hash split xxxxxxxxxxxxxxxx',
  date_start: '2026-06-01',
  date_end: '2026-06-01',
  time_start: '08:00:00',
  time_end: '14:00:00',
  raw_payload: { imageUrls: ['https://example.com/prior.jpg'] },
  image_source_url: null,
  published_sale_id: 'sale-1',
  last_source_sync_at: null,
  source_sync_status: null,
  source_sync_attempt_count: 0,
  source_sync_failure_count: 0,
  source_missing_count: 0,
  source_placeholder_detected: false,
  source_content_hash: null,
  source_schedule_hash: null,
  source_image_hash: null,
  status: 'published',
  is_duplicate: false,
  last_source_change_at: null,
})

const sharedPeekMap = (): Map<
  string,
  {
    address: string | null
    city: string | null
    state: string | null
    date_start: string | null
    date_end: string | null
    time_start: string | null
    time_end: string | null
  }
> =>
  new Map([
    [
      'sale-1',
      {
        address: '1 Main St',
        city: 'Oak Lawn',
        state: 'IL',
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '08:00:00',
        time_end: '14:00:00',
      },
    ],
  ])

const fetchRpc = vi.fn()
const readCursor = vi.fn()
const writeCursor = vi.fn()

vi.mock('@/lib/reconciliation/reconciliationCandidateLoad', () => ({
  fetchReconciliationCandidatePageRpc: (...a: unknown[]) => fetchRpc(...a),
  parseReconciliationCandidatePoolMax: () => 10_000,
  readReconciliationCoverageCursor: (...a: unknown[]) => readCursor(...a),
  writeReconciliationCoverageCursor: (...a: unknown[]) => writeCursor(...a),
  reconciliationCoverageStateKey: () => 'default',
}))

vi.mock('@/lib/ingestion/adapters/externalPageSafeFetch', () => ({
  fetchSafeExternalPageHtml: vi.fn().mockRejectedValue(new Error('network')),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: vi.fn(),
}))

vi.mock('@/lib/observability/emit', () => ({
  emitObservabilityRecord: vi.fn(),
  buildTelemetryRecord: vi.fn((_e: unknown, fields: Record<string, unknown>) => fields),
}))

import { fromBase } from '@/lib/supabase/clients'
import { reconcileExternalSources } from '@/lib/reconciliation/reconcileExternalSources'

describe('reconcileExternalSources candidate RPC + coverage cursor', () => {
  beforeEach(() => {
    fetchRpc.mockReset()
    readCursor.mockReset()
    writeCursor.mockReset()
    vi.mocked(fromBase).mockReset()
    vi.mocked(fromBase).mockImplementation(
      ((...args: Parameters<typeof fromBase>) => {
        const [, table] = args
        if (table === 'ingested_sales') {
          return {
            update: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }
        }
        return {}
      }) as typeof fromBase,
    )
  })

  it('does not clear or advance persisted cursor when the first RPC call fails', async () => {
    readCursor.mockResolvedValue({
      tier: 1,
      placeholder: 1,
      never: 1,
      ingestId: '00000000-0000-4000-8000-000000000099',
    })
    fetchRpc.mockResolvedValue({
      ok: false,
      rows: [],
      salePeekBySaleId: new Map(),
      errorCode: 'rpc_test_fail',
    })

    const result = await reconcileExternalSources({
      dryRun: true,
      aggregateTelemetryOnly: true,
      limit: 5,
      skipCoverageCursorPersistence: false,
    })

    expect(result.candidatePageRpcOk).toBe(false)
    expect(result.candidatePageRpcErrorCode).toBe('rpc_test_fail')
    expect(fetchRpc).toHaveBeenCalledTimes(1)
    expect(writeCursor).not.toHaveBeenCalled()
  })

  it('successful empty-first page wraps only after wrap RPC succeeds (cursor cleared once)', async () => {
    readCursor.mockResolvedValue({
      tier: 0,
      placeholder: 0,
      never: 0,
      ingestId: '00000000-0000-4000-8000-000000000099',
    })
    fetchRpc
      .mockResolvedValueOnce({
        ok: true,
        rows: [],
        salePeekBySaleId: new Map(),
        errorCode: null,
      })
      .mockResolvedValueOnce({
        ok: true,
        rows: [sharedIngestRecord()],
        salePeekBySaleId: sharedPeekMap(),
        errorCode: null,
      })

    const result = await reconcileExternalSources({
      dryRun: true,
      aggregateTelemetryOnly: true,
      limit: 5,
    })

    expect(result.candidatePageRpcOk).toBe(true)
    expect(fetchRpc).toHaveBeenCalledTimes(2)
    expect(writeCursor).toHaveBeenCalledTimes(1)
    expect(writeCursor).toHaveBeenCalledWith(expect.anything(), 'default', null)
  })

  it('successful empty-first page preserves cursor when wrap RPC fails', async () => {
    readCursor.mockResolvedValue({
      tier: 2,
      placeholder: 1,
      never: 1,
      ingestId: '00000000-0000-4000-8000-000000000088',
    })
    fetchRpc
      .mockResolvedValueOnce({
        ok: true,
        rows: [],
        salePeekBySaleId: new Map(),
        errorCode: null,
      })
      .mockResolvedValueOnce({
        ok: false,
        rows: [],
        salePeekBySaleId: new Map(),
        errorCode: 'wrap_failed',
      })

    const result = await reconcileExternalSources({
      dryRun: true,
      aggregateTelemetryOnly: true,
      limit: 5,
    })

    expect(result.candidatePageRpcOk).toBe(false)
    expect(result.candidatePageRpcErrorCode).toBe('wrap_failed')
    expect(writeCursor).not.toHaveBeenCalled()
  })

  it('advances persisted cursor after a successful processed batch when dryRun is false', async () => {
    readCursor.mockResolvedValue(null)
    fetchRpc.mockResolvedValue({
      ok: true,
      rows: [sharedIngestRecord()],
      salePeekBySaleId: sharedPeekMap(),
      errorCode: null,
    })

    const result = await reconcileExternalSources({
      dryRun: false,
      aggregateTelemetryOnly: true,
      limit: 1,
    })

    expect(result.candidatePageRpcOk).toBe(true)
    expect(writeCursor).toHaveBeenCalledWith(expect.anything(), 'default', {
      tier: 0,
      placeholder: 1,
      never: 0,
      ingestId: 'ing-1',
    })
  })
})
