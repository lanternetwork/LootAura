import { describe, expect, it } from 'vitest'
import { computeReconciliationSortKey, orderReconciliationCandidates } from '@/lib/reconciliation/reconciliationSelection'
import type { ReconciliationCandidateRow } from '@/lib/reconciliation/types'

function cmp(
  a: readonly [number, number, number, string],
  b: readonly [number, number, number, string]
): number {
  for (let i = 0; i < 4; i++) {
    const av = a[i]!
    const bv = b[i]!
    if (av === bv) continue
    if (typeof av === 'number' && typeof bv === 'number') return av - bv
    return String(av).localeCompare(String(bv))
  }
  return 0
}

function baseRow(id: string, partial: Partial<ReconciliationCandidateRow> = {}): ReconciliationCandidateRow {
  return {
    id,
    source_url: 'https://example.com/x',
    source_platform: 'external_page_source',
    city: 'C',
    state: 'IL',
    title: 't',
    description: 'd',
    date_start: null,
    date_end: null,
    time_start: null,
    time_end: null,
    raw_payload: {},
    image_source_url: null,
    published_sale_id: 'sale',
    last_source_sync_at: new Date(1_720_000_000_000 - 60_000).toISOString(),
    source_sync_status: null,
    source_sync_failure_count: 0,
    source_placeholder_detected: false,
    source_content_hash: null,
    source_schedule_hash: null,
    source_image_hash: null,
    ...partial,
  }
}

function takeKeysetPage(
  ordered: readonly ReconciliationCandidateRow[],
  after: ReturnType<typeof computeReconciliationSortKey> | null,
  poolSize: number,
  nowMs: number
): ReconciliationCandidateRow[] {
  const out: ReconciliationCandidateRow[] = []
  for (const r of ordered) {
    const k = computeReconciliationSortKey(r, nowMs)
    if (after && cmp(k, after) <= 0) continue
    out.push(r)
    if (out.length >= poolSize) break
  }
  return out
}

describe('reconciliation candidate coverage (deterministic keyset)', () => {
  const nowMs = 1_720_000_000_000

  it('keyset paging across pools eventually marks every id in a 600-row catalog', () => {
    const rows: ReconciliationCandidateRow[] = []
    for (let i = 0; i < 600; i++) {
      const id = `ing-${String(i).padStart(4, '0')}`
      rows.push(
        baseRow(id, {
          last_source_sync_at: new Date(nowMs - 3_000 - i).toISOString(),
          source_placeholder_detected: i % 50 === 0,
        })
      )
    }
    const ordered = orderReconciliationCandidates(rows, nowMs)
    const ids = new Set<string>()
    let after: ReturnType<typeof computeReconciliationSortKey> | null = null
    let guard = 0
    while (ids.size < 600 && guard < 40) {
      guard += 1
      let page = takeKeysetPage(ordered, after, 100, nowMs)
      if (page.length === 0 && after) {
        after = null
        page = takeKeysetPage(ordered, after, 100, nowMs)
      }
      if (page.length === 0) break
      for (const r of page) {
        ids.add(r.id)
      }
      after = computeReconciliationSortKey(page[page.length - 1]!, nowMs)
    }
    expect(ids.size).toBe(600)
  })

  it('does not emit duplicate ids within a single ordered pool', () => {
    const rows: ReconciliationCandidateRow[] = []
    for (let i = 0; i < 50; i++) {
      rows.push(baseRow(`id-${i}`))
    }
    const ordered = orderReconciliationCandidates(rows, nowMs)
    const seen = new Set<string>()
    for (const r of ordered) {
      expect(seen.has(r.id)).toBe(false)
      seen.add(r.id)
    }
    expect(seen.size).toBe(50)
  })

  it('preserves priority: placeholder rows sort before non-placeholder at same tier', () => {
    const lateFresh = baseRow('late', { last_source_sync_at: new Date(nowMs - 60_000).toISOString() })
    const ph = baseRow('early-ph', {
      source_placeholder_detected: true,
      last_source_sync_at: new Date(nowMs - 60_000).toISOString(),
    })
    const ordered = orderReconciliationCandidates([lateFresh, ph], nowMs)
    expect(ordered[0]!.id).toBe('early-ph')
    expect(ordered[1]!.id).toBe('late')
  })

  it('respects batch limit: first N of ordered pool are the first N globally', () => {
    const rows = [baseRow('c'), baseRow('a'), baseRow('b')]
    const ordered = orderReconciliationCandidates(rows, nowMs)
    const batch = ordered.slice(0, 2)
    expect(batch.map((r) => r.id)).toEqual([ordered[0]!.id, ordered[1]!.id])
  })
})
