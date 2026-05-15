import { describe, expect, it, vi, beforeEach } from 'vitest'

const reconCtx = vi.hoisted(() => ({
  ingestedUpdateCalls: 0,
  rpcPageRows: [
    {
      ingest: {
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
      },
      sale_id: 'sale-1',
      sale_peek: {
        address: '1 Main St',
        city: 'Oak Lawn',
        state: 'IL',
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '08:00:00',
        time_end: '14:00:00',
      },
    },
  ] as const,
}))

vi.mock('@/lib/reconciliation/reconciliationCandidateLoad', () => ({
  fetchReconciliationCandidatePageRpc: vi.fn().mockImplementation(() =>
    Promise.resolve({
      rows: reconCtx.rpcPageRows.map((r) => r.ingest as Record<string, unknown>),
      salePeekBySaleId: new Map([
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
      ]),
    })
  ),
  parseReconciliationCandidatePoolMax: () => 10_000,
  readReconciliationCoverageCursor: vi.fn().mockResolvedValue(null),
  writeReconciliationCoverageCursor: vi.fn().mockResolvedValue(undefined),
  reconciliationCoverageStateKey: () => 'default',
}))

vi.mock('@/lib/ingestion/adapters/externalPageSafeFetch', () => ({
  fetchSafeExternalPageHtml: vi.fn().mockRejectedValue(new Error('network')),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: vi.fn(),
}))

import { fromBase } from '@/lib/supabase/clients'
import { reconcileExternalSources } from '@/lib/reconciliation/reconcileExternalSources'
import * as syncPublished from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'

describe('reconcileExternalSources dryRun default', () => {
  const trySpy = vi.spyOn(syncPublished, 'tryApplySafePublishedSaleSyncFromReconciliation')

  beforeEach(() => {
    reconCtx.ingestedUpdateCalls = 0
    trySpy.mockClear()
    vi.mocked(fromBase).mockReset()
    vi.mocked(fromBase).mockImplementation(((_admin: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => ({
            eq: () => ({
              update: () => ({
                eq: () => {
                  reconCtx.ingestedUpdateCalls += 1
                  return Promise.resolve({ error: null })
                },
              }),
            }),
          }),
          update: () => ({
            eq: () => {
              reconCtx.ingestedUpdateCalls += 1
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      return {}
    }) as never)
  })

  it('omitted dryRun performs no ingested_sales persistence (side-effect safe)', async () => {
    const result = await reconcileExternalSources({ limit: 1, aggregateTelemetryOnly: true })
    expect(result.dryRun).toBe(true)
    expect(result.persistenceApplied).toBe(false)
    expect(reconCtx.ingestedUpdateCalls).toBe(0)
    expect(trySpy).not.toHaveBeenCalled()
  })

  it('persists ingested_sales metadata when dryRun is explicitly false', async () => {
    const result = await reconcileExternalSources({
      limit: 1,
      dryRun: false,
      aggregateTelemetryOnly: true,
    })
    expect(result.dryRun).toBe(false)
    expect(result.persistenceApplied).toBe(true)
    expect(reconCtx.ingestedUpdateCalls).toBeGreaterThan(0)
  })

  it('does not invoke Phase 2A tryApply when applySafeSync is false', async () => {
    await reconcileExternalSources({
      limit: 1,
      dryRun: false,
      applySafeSync: false,
      aggregateTelemetryOnly: true,
    })
    expect(trySpy).not.toHaveBeenCalled()
  })
})
