import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/174_ingested_sales_source_reconciliation_phase1a.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 174 ingested_sales reconciliation phase 1a', () => {
  it('adds reconciliation columns on lootaura_v2.ingested_sales', () => {
    expect(sql).toContain('ALTER TABLE lootaura_v2.ingested_sales')
    expect(sql).toContain('last_source_sync_at')
    expect(sql).toContain('last_source_change_at')
    expect(sql).toContain('source_sync_status')
    expect(sql).toContain('source_sync_attempt_count')
    expect(sql).toContain('source_sync_failure_count')
    expect(sql).toContain('source_missing_count')
    expect(sql).toContain('source_content_hash')
    expect(sql).toContain('source_schedule_hash')
    expect(sql).toContain('source_image_hash')
    expect(sql).toContain('source_placeholder_detected')
    expect(sql).toContain('source_cancelled_detected')
    expect(sql).toContain('source_reconciliation_details')
  })

  it('creates reconciliation selection indexes', () => {
    expect(sql).toContain('idx_ingested_sales_recon_status')
    expect(sql).toContain('idx_ingested_sales_recon_last_sync')
    expect(sql).toContain('idx_ingested_sales_recon_placeholder')
    expect(sql).toContain('idx_ingested_sales_recon_active_pick')
  })
})
