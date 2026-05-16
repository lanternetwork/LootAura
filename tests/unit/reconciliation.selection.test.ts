import { describe, expect, it } from 'vitest'
import { orderReconciliationCandidates } from '@/lib/reconciliation/reconciliationSelection'
import type { ReconciliationCandidateRow } from '@/lib/reconciliation/types'

function row(partial: Partial<ReconciliationCandidateRow> & { id: string }): ReconciliationCandidateRow {
  return {
    source_url: 'https://example.com/a',
    source_platform: 'external_page_source',
    city: 'Chicago',
    state: 'IL',
    title: 't',
    description: 'd',
    date_start: null,
    date_end: null,
    time_start: null,
    time_end: null,
    raw_payload: {},
    image_source_url: null,
    published_sale_id: 'sale-1',
    last_source_sync_at: null,
    source_sync_status: null,
    source_sync_failure_count: 0,
    source_placeholder_detected: false,
    source_content_hash: null,
    source_schedule_hash: null,
    source_image_hash: null,
    ...partial,
  }
}

describe('reconciliationSelection', () => {
  it('orders placeholder and never-synced before stable rows', () => {
    const now = 1_700_000_000_000
    const a = row({
      id: 'a',
      source_placeholder_detected: false,
      last_source_sync_at: new Date(now - 60_000).toISOString(),
    })
    const b = row({
      id: 'b',
      source_placeholder_detected: true,
      last_source_sync_at: new Date(now - 60_000).toISOString(),
    })
    const c = row({ id: 'c', last_source_sync_at: null })
    const out = orderReconciliationCandidates([a, b, c], now)
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('is deterministic for ties (id lexicographic)', () => {
    const now = 1_700_000_000_000
    const x = row({ id: 'x', last_source_sync_at: null })
    const y = row({ id: 'y', last_source_sync_at: null })
    expect(orderReconciliationCandidates([x, y], now).map((r) => r.id)).toEqual(['x', 'y'])
    expect(orderReconciliationCandidates([y, x], now).map((r) => r.id)).toEqual(['x', 'y'])
  })
})
