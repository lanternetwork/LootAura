import { describe, expect, it } from 'vitest'
import { reconciliationPersistPatchUnchanged } from '@/lib/reconciliation/reconciliationPersistGuard'

describe('reconciliationPersistPatchUnchanged', () => {
  it('returns true when only last_source_sync_at would change', () => {
    const row = {
      source_sync_status: 'unchanged',
      source_cancelled_detected: false,
      source_reconciliation_details: { primaryChange: 'unchanged' },
      last_source_sync_at: '2026-06-17T10:00:00.000Z',
    }
    const patch = {
      last_source_sync_at: '2026-06-17T12:00:00.000Z',
      source_sync_status: 'unchanged',
      source_cancelled_detected: false,
      source_reconciliation_details: { primaryChange: 'unchanged' },
    }
    expect(reconciliationPersistPatchUnchanged(row, patch)).toBe(true)
  })

  it('returns false when sync counters would advance', () => {
    const row = {
      source_sync_attempt_count: 1,
      source_sync_failure_count: 0,
      source_missing_count: 0,
      last_source_sync_at: '2026-06-17T10:00:00.000Z',
    }
    const patch = {
      last_source_sync_at: '2026-06-17T12:00:00.000Z',
      source_sync_attempt_count: 2,
      source_sync_failure_count: 1,
      source_missing_count: 1,
    }
    expect(reconciliationPersistPatchUnchanged(row, patch)).toBe(false)
  })

  it('returns false when reconciliation details differ', () => {
    const row = {
      source_reconciliation_details: { primaryChange: 'unchanged' },
    }
    const patch = {
      source_reconciliation_details: { primaryChange: 'description_changed' },
    }
    expect(reconciliationPersistPatchUnchanged(row, patch)).toBe(false)
  })
})
