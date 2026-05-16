import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/166_legacy_publishing_past_end_date_validation_cleanup.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('claim_ingested_sales_for_publish migration SKIP LOCKED contract', () => {
  it('claims with FOR UPDATE SKIP LOCKED', () => {
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
  })

  it('orders candidates deterministically before lock', () => {
    expect(sql).toContain('ORDER BY s.created_at ASC')
  })
})
