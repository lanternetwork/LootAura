import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildReconciledScheduleBundle } from '@/lib/reconciliation/reconciledScheduleBundle'
import type { IngestFingerprint } from '@/lib/reconciliation/types'

const resolveEndsAtMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ends_at: '2026-06-01T21:00:00.000Z',
    listing_timezone: 'America/Chicago',
  })
)

vi.mock('@/lib/sales/resolvePersistableSaleEndsAt', () => ({
  resolvePersistableSaleEndsAt: resolveEndsAtMock,
}))

vi.mock('@/lib/ingestion/externalImageValidation', () => ({
  sanitizeExternalImageUrls: async (candidates: unknown) => {
    if (!Array.isArray(candidates)) return []
    return candidates.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
  },
}))

const tryApplyCtx = vi.hoisted(() => ({
  ingestedUpdatePayloads: [] as unknown[],
  saleMaybeSingleCalls: 0,
  initialSale: {
    id: 'sale-1',
    ingested_sale_id: 'ing-1',
    title: 'Estate Sale',
    description: `${'Old sale description body. '.repeat(5)}padding`,
    address: '1 Main St',
    city: 'Oak Lawn',
    state: 'IL',
    zip_code: '60453',
    lat: 41.72,
    lng: -87.75,
    date_start: '2026-06-01',
    date_end: '2026-06-01',
    time_start: '08:00:00',
    time_end: '14:00:00',
    ends_at: null,
    listing_timezone: null,
    cover_image_url: null,
    images: [] as string[],
    moderation_status: null as string | null,
  },
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: vi.fn((_admin: unknown, table: string) => {
    if (table === 'ingested_sales') {
      return {
        update: (payload: unknown) => {
          tryApplyCtx.ingestedUpdatePayloads.push(payload)
          return {
            eq: async () => ({ error: null }),
          }
        },
      }
    }
    if (table === 'sales') {
      const initialSale = tryApplyCtx.initialSale
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              tryApplyCtx.saleMaybeSingleCalls += 1
              if (tryApplyCtx.saleMaybeSingleCalls === 1) {
                return { data: initialSale, error: null }
              }
              return {
                data: {
                  date_start: '2026-06-01',
                  date_end: '2026-06-01',
                  time_start: '09:00:00',
                  time_end: '15:00:00',
                  listing_timezone: 'America/Chicago',
                },
                error: null,
              }
            },
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    }
    return {}
  }),
}))

import { tryApplySafePublishedSaleSyncFromReconciliation } from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'

describe('tryApplySafePublishedSaleSyncFromReconciliation — ingest schedule mirror', () => {
  beforeEach(() => {
    tryApplyCtx.ingestedUpdatePayloads.length = 0
    tryApplyCtx.saleMaybeSingleCalls = 0
    resolveEndsAtMock.mockClear()
    resolveEndsAtMock.mockResolvedValue({
      ends_at: '2026-06-01T21:00:00.000Z',
      listing_timezone: 'America/Chicago',
    })
  })

  const priorFingerprint: IngestFingerprint = {
    contentHash: 'c1',
    scheduleHash: 'sched-old',
    imageHash: 'i1',
  }
  const nextFingerprint: IngestFingerprint = {
    contentHash: 'c1',
    scheduleHash: 'sched-new',
    imageHash: 'i1',
  }

  const snapshot = {
    title: 'Estate Sale',
    description: 'Hours 9:00 am - 3:00 pm.',
    imageUrls: [] as const,
    dateStart: '2026-06-01',
    dateEnd: '2026-06-01',
    timeStart: '09:00:00',
    timeEnd: '15:00:00',
  }

  const scheduleBundleResult = buildReconciledScheduleBundle({
    refreshedDescription: snapshot.description,
    parsed: snapshot,
    ingest: {
      date_start: '2026-06-01',
      date_end: '2026-06-01',
      time_start: '08:00:00',
      time_end: '14:00:00',
      raw_payload: {},
    },
    sale: {
      date_start: '2026-06-01',
      date_end: '2026-06-01',
      time_start: '08:00:00',
      time_end: '14:00:00',
    },
    lat: 41.72,
    lng: -87.75,
  })
  if (!scheduleBundleResult.ok) {
    throw new Error('expected bundle ok')
  }

  const baseCtx = {
    saleId: 'sale-1',
    ingestedSaleId: 'ing-1',
    rowId: 'ing-1',
    snapshot,
    ingest: {
      normalized_address: '1 Main St',
      zip_code: '60453',
      lat: 41.72,
      lng: -87.75,
      time_start: '08:00:00',
      time_end: '14:00:00',
      raw_payload: { keep: true },
      image_source_url: null as string | null,
    },
    priorFingerprint,
    nextFingerprint,
    city: 'Oak Lawn',
    state: 'IL',
    nowMs: Date.UTC(2026, 4, 1),
    scheduleBundleResult,
  }

  it('mirrors ingest schedule after successful schedule write', async () => {
    const res = await tryApplySafePublishedSaleSyncFromReconciliation({} as never, {
      ...baseCtx,
      classes: ['schedule_changed'],
      dryRun: false,
    })
    expect(res.outcome).toBe('updated')
    expect(res.schedulesUpdated).toBe(true)
    expect(res.mirroredIngestSchedule).toBe(true)
    expect(tryApplyCtx.ingestedUpdatePayloads).toHaveLength(1)
    expect(tryApplyCtx.ingestedUpdatePayloads[0]).toMatchObject({
      date_start: '2026-06-01',
      time_start: '09:00:00',
      time_end: '15:00:00',
      raw_payload: { keep: true, listing_timezone: 'America/Chicago' },
    })
  })

  it('does not mirror on dryRun', async () => {
    const res = await tryApplySafePublishedSaleSyncFromReconciliation({} as never, {
      ...baseCtx,
      classes: ['schedule_changed'],
      dryRun: true,
    })
    expect(res.skipReason).toBe('dry_run')
    expect(res.schedulesUpdated).toBe(true)
    expect(res.mirroredIngestSchedule ?? false).toBe(false)
    expect(tryApplyCtx.ingestedUpdatePayloads).toHaveLength(0)
  })

  it('does not mirror when schedule mutation is inhibited (ends_at unresolved)', async () => {
    resolveEndsAtMock.mockResolvedValueOnce({ ends_at: null, listing_timezone: null })
    const longerDesc = `${tryApplyCtx.initialSale.description!} MORE_DESC_FOR_CONTENT_CHANGE`
    const res = await tryApplySafePublishedSaleSyncFromReconciliation({} as never, {
      ...baseCtx,
      snapshot: { ...snapshot, description: longerDesc },
      classes: ['schedule_changed', 'description_changed'],
      priorFingerprint: { contentHash: 'a', scheduleHash: 's1', imageHash: 'i1' },
      nextFingerprint: { contentHash: 'b', scheduleHash: 's2', imageHash: 'i1' },
      dryRun: false,
    })
    expect(res.outcome).toBe('updated')
    expect(res.schedulesUpdated).toBe(false)
    expect(res.scheduleMutationInhibited).toBe(true)
    expect(res.mirroredIngestSchedule).toBe(false)
    expect(tryApplyCtx.ingestedUpdatePayloads).toHaveLength(0)
  })

  it('does not mirror when schedulesUpdated is false (description-only Phase 2A)', async () => {
    const prevTimeStart = tryApplyCtx.initialSale.time_start
    const prevTimeEnd = tryApplyCtx.initialSale.time_end
    tryApplyCtx.initialSale.time_start = '09:00:00'
    tryApplyCtx.initialSale.time_end = '15:00:00'
    const longExisting = tryApplyCtx.initialSale.description!
    const longerNext = `${longExisting}NEW_PARAGRAPH_WITH_SUBSTANTIVE_CONTENT_FOR_SAFE_SYNC_POLICY`
    const res = await tryApplySafePublishedSaleSyncFromReconciliation({} as never, {
      ...baseCtx,
      snapshot: { ...snapshot, description: longerNext },
      classes: ['description_changed'],
      priorFingerprint: { contentHash: 'a', scheduleHash: 's', imageHash: 'i1' },
      nextFingerprint: { contentHash: 'b', scheduleHash: 's', imageHash: 'i1' },
      dryRun: false,
    })
    expect(res.outcome).toBe('updated')
    expect(res.schedulesUpdated).toBe(false)
    expect(res.mirroredIngestSchedule).toBe(false)
    expect(tryApplyCtx.ingestedUpdatePayloads).toHaveLength(0)
    tryApplyCtx.initialSale.time_start = prevTimeStart
    tryApplyCtx.initialSale.time_end = prevTimeEnd
  })
})
