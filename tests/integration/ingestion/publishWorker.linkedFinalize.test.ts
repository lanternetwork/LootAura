import { beforeEach, describe, expect, it, vi } from 'vitest'

type IngestedRow = {
  id: string
  status: string
  published_sale_id: string | null
  published_at: string | null
  failure_reasons: unknown
  failure_details: unknown
  updated_at: string
}

type SaleRow = {
  id: string
  ingested_sale_id: string | null
}

const ctx = vi.hoisted(() => {
  const ingestedRows: IngestedRow[] = []
  const salesRows: SaleRow[] = []
  const loggerInfo = vi.fn()
  const loggerWarn = vi.fn()
  const loggerError = vi.fn()

  function reset() {
    ingestedRows.splice(0, ingestedRows.length)
    salesRows.splice(0, salesRows.length)
    loggerInfo.mockReset()
    loggerWarn.mockReset()
    loggerError.mockReset()
  }

  return {
    ingestedRows,
    salesRows,
    loggerInfo,
    loggerWarn,
    loggerError,
    reset,
  }
})

vi.mock('@/lib/log', () => ({
  logger: {
    info: (...args: unknown[]) => ctx.loggerInfo(...args),
    warn: (...args: unknown[]) => ctx.loggerWarn(...args),
    error: (...args: unknown[]) => ctx.loggerError(...args),
  },
}))

vi.mock('@/lib/supabase/clients', () => {
  function buildIngestedSelectChain() {
    const state = {
      notCol: '' as string,
      notValue: null as unknown,
      neqCol: '' as string,
      neqValue: null as unknown,
      limitN: 100,
    }
    return {
      not(col: string, _op: string, value: unknown) {
        state.notCol = col
        state.notValue = value
        return this
      },
      neq(col: string, value: unknown) {
        state.neqCol = col
        state.neqValue = value
        return this
      },
      order() {
        return this
      },
      async limit(n: number) {
        state.limitN = n
        let rows = [...ctx.ingestedRows]
        if (state.notCol === 'published_sale_id' && state.notValue === null) {
          rows = rows.filter((r) => r.published_sale_id !== null)
        }
        if (state.neqCol === 'status') {
          rows = rows.filter((r) => r.status !== state.neqValue)
        }
        rows.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        return { data: rows.slice(0, state.limitN), error: null }
      },
    }
  }

  function buildIngestedUpdateChain(payload: Record<string, unknown>) {
    const state = {
      id: '' as string,
      publishedSaleId: null as string | null,
      neqStatusValue: null as string | null,
    }
    return {
      eq(col: string, value: string) {
        if (col === 'id') state.id = value
        if (col === 'published_sale_id') state.publishedSaleId = value
        return this
      },
      async neq(col: string, value: string) {
        if (col === 'status') state.neqStatusValue = value
        const row = ctx.ingestedRows.find((r) => r.id === state.id)
        if (!row) return { error: null }
        if (state.publishedSaleId != null && row.published_sale_id !== state.publishedSaleId) {
          return { error: null }
        }
        if (state.neqStatusValue != null && row.status === state.neqStatusValue) {
          return { error: null }
        }
        Object.assign(row, payload)
        return { error: null }
      },
    }
  }

  function buildSalesSelectChain() {
    const state = { id: '' as string }
    return {
      eq(col: string, value: string) {
        if (col === 'id') state.id = value
        return this
      },
      async limit(n: number) {
        const rows = ctx.salesRows.filter((r) => r.id === state.id).slice(0, n)
        return { data: rows, error: null }
      },
    }
  }

  return {
    getAdminDb: vi.fn(() => ({})),
    fromBase: vi.fn((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => buildIngestedSelectChain(),
          update: (payload: Record<string, unknown>) => buildIngestedUpdateChain(payload),
        }
      }
      if (table === 'sales') {
        return {
          select: () => buildSalesSelectChain(),
        }
      }
      return {}
    }),
  }
})

describe('finalizeLinkedPublishedIngestedSales', () => {
  beforeEach(() => {
    ctx.reset()
  })

  it('valid linked sale finalizes and clears transient publish metadata', async () => {
    ctx.ingestedRows.push({
      id: 'ing-1',
      status: 'publish_failed',
      published_sale_id: 'sale-1',
      published_at: null,
      failure_reasons: ['publish_error', 'duplicate_detected'],
      failure_details: { phase: 'create_sale', publish_error: 'timeout' },
      updated_at: '2026-05-09T01:00:00.000Z',
    })
    ctx.salesRows.push({ id: 'sale-1', ingested_sale_id: 'ing-1' })

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })

    expect(summary).toMatchObject({
      attempted: 1,
      finalized: 1,
      linkMismatch: 0,
      missingLinkedSale: 0,
    })
    expect(ctx.ingestedRows[0].status).toBe('published')
    expect(ctx.ingestedRows[0].published_at).toEqual(expect.any(String))
    expect(ctx.ingestedRows[0].failure_reasons).toEqual(['duplicate_detected'])
    expect(ctx.ingestedRows[0].failure_details).toBeNull()
  })

  it('needs_check with valid linked sale converges to published and clears invalid_date', async () => {
    ctx.ingestedRows.push({
      id: 'ing-needs-check',
      status: 'needs_check',
      published_sale_id: 'sale-needs-check',
      published_at: null,
      failure_reasons: ['invalid_date', 'publish_error'],
      failure_details: {
        phase: 'validation',
        operation: 'publish_validation',
        reason: 'past_end_date',
        publish_error: 'date window invalid',
      },
      updated_at: '2026-05-09T01:00:00.000Z',
    })
    ctx.salesRows.push({ id: 'sale-needs-check', ingested_sale_id: 'ing-needs-check' })

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })

    expect(summary).toMatchObject({
      attempted: 1,
      finalized: 1,
      linkMismatch: 0,
      missingLinkedSale: 0,
    })
    expect(ctx.ingestedRows[0].status).toBe('published')
    expect(ctx.ingestedRows[0].failure_reasons).toEqual([])
    expect(ctx.ingestedRows[0].failure_details).toBeNull()
  })

  it('already published rows are no-op', async () => {
    ctx.ingestedRows.push({
      id: 'ing-2',
      status: 'published',
      published_sale_id: 'sale-2',
      published_at: '2026-05-09T01:00:00.000Z',
      failure_reasons: [],
      failure_details: null,
      updated_at: '2026-05-09T01:00:00.000Z',
    })
    ctx.salesRows.push({ id: 'sale-2', ingested_sale_id: 'ing-2' })

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })

    expect(summary.attempted).toBe(0)
    expect(summary.finalized).toBe(0)
  })

  it('invalid linked sale fails closed and logs link_mismatch', async () => {
    ctx.ingestedRows.push({
      id: 'ing-3',
      status: 'ready',
      published_sale_id: 'sale-3',
      published_at: null,
      failure_reasons: [],
      failure_details: null,
      updated_at: '2026-05-09T01:00:00.000Z',
    })
    ctx.salesRows.push({ id: 'sale-3', ingested_sale_id: 'ing-other' })

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })

    expect(summary).toMatchObject({ finalized: 0, linkMismatch: 1 })
    expect(ctx.ingestedRows[0].status).toBe('publish_failed')
    expect(ctx.ingestedRows[0].failure_reasons).toEqual(['publish_error'])
    expect(ctx.loggerError).toHaveBeenCalledWith(
      'Linked-sale finalization skipped due to mismatched sale linkage',
      expect.any(Error),
      expect.objectContaining({ reason: 'link_mismatch', rowId: 'ing-3', saleId: 'sale-3' })
    )
  })

  it('preserves terminal validation reasons when link is invalid', async () => {
    ctx.ingestedRows.push({
      id: 'ing-terminal',
      status: 'ready',
      published_sale_id: 'sale-terminal',
      published_at: null,
      failure_reasons: ['invalid_date'],
      failure_details: {
        phase: 'validation',
        operation: 'publish_validation',
        reason: 'past_end_date',
      },
      updated_at: '2026-05-09T01:00:00.000Z',
    })
    ctx.salesRows.push({ id: 'sale-terminal', ingested_sale_id: 'ing-other' })

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })

    expect(summary).toMatchObject({ finalized: 0, linkMismatch: 1 })
    expect(ctx.ingestedRows[0].status).toBe('publish_failed')
    expect(ctx.ingestedRows[0].failure_reasons).toEqual(['invalid_date', 'publish_error'])
    expect(ctx.ingestedRows[0].failure_details).toEqual({
      phase: 'validation',
      operation: 'publish_validation',
      reason: 'past_end_date',
    })
  })

  it('missing linked sale fails closed and preserves row state', async () => {
    ctx.ingestedRows.push({
      id: 'ing-4',
      status: 'ready',
      published_sale_id: 'sale-missing',
      published_at: null,
      failure_reasons: [],
      failure_details: null,
      updated_at: '2026-05-09T01:00:00.000Z',
    })

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })

    expect(summary).toMatchObject({ finalized: 0, missingLinkedSale: 1 })
    expect(ctx.ingestedRows[0].status).toBe('ready')
  })

  it('is idempotent on second run', async () => {
    ctx.ingestedRows.push({
      id: 'ing-5',
      status: 'publish_failed',
      published_sale_id: 'sale-5',
      published_at: null,
      failure_reasons: ['publish_error'],
      failure_details: { phase: 'finalize_ingested_row', publish_error: 'timeout' },
      updated_at: '2026-05-09T01:00:00.000Z',
    })
    ctx.salesRows.push({ id: 'sale-5', ingested_sale_id: 'ing-5' })

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const first = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })
    const second = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 10 })

    expect(first.finalized).toBe(1)
    expect(second.finalized).toBe(0)
    expect(second.attempted).toBe(0)
  })

  it('respects batch limit', async () => {
    ctx.ingestedRows.push(
      {
        id: 'ing-6',
        status: 'publish_failed',
        published_sale_id: 'sale-6',
        published_at: null,
        failure_reasons: ['publish_error'],
        failure_details: { phase: 'create_sale', publish_error: 'timeout' },
        updated_at: '2026-05-09T01:00:00.000Z',
      },
      {
        id: 'ing-7',
        status: 'publish_failed',
        published_sale_id: 'sale-7',
        published_at: null,
        failure_reasons: ['publish_error'],
        failure_details: { phase: 'create_sale', publish_error: 'timeout' },
        updated_at: '2026-05-09T01:01:00.000Z',
      },
      {
        id: 'ing-8',
        status: 'publish_failed',
        published_sale_id: 'sale-8',
        published_at: null,
        failure_reasons: ['publish_error'],
        failure_details: { phase: 'create_sale', publish_error: 'timeout' },
        updated_at: '2026-05-09T01:02:00.000Z',
      }
    )
    ctx.salesRows.push(
      { id: 'sale-6', ingested_sale_id: 'ing-6' },
      { id: 'sale-7', ingested_sale_id: 'ing-7' },
      { id: 'sale-8', ingested_sale_id: 'ing-8' }
    )

    const { finalizeLinkedPublishedIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await finalizeLinkedPublishedIngestedSales({ batchSizeOverride: 2 })

    expect(summary.attempted).toBe(2)
    expect(summary.finalized).toBe(2)
    expect(ctx.ingestedRows.filter((r) => r.status === 'published')).toHaveLength(2)
    expect(ctx.ingestedRows.find((r) => r.id === 'ing-8')?.status).toBe('publish_failed')
  })
})

