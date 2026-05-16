import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/165_ingested_sales_expired_status.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 165 ingested_sales expired status', () => {
  it('adds publish_expired_count to orchestration runs', () => {
    expect(sql).toContain('ingestion_orchestration_runs')
    expect(sql).toContain('publish_expired_count')
  })

  it('extends ingested_sales status check to include expired', () => {
    expect(sql).toContain('ingested_sales_status_check')
    expect(sql).toMatch(/'expired'/)
  })

  it('backfills publish_failed + past_end_date to expired and sale_expired', () => {
    expect(sql).toContain("status = 'publish_failed'")
    expect(sql).toContain("= 'past_end_date'")
    expect(sql).toContain("status = 'expired'")
    expect(sql).toContain("'sale_expired'")
    expect(sql).toContain("e <> 'publish_error'")
  })
})
