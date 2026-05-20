import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 195 ingestion detail-first time_source', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/195_ingestion_detail_first_time_source.sql'),
    'utf8'
  )

  it('extends time_source check to include ystm_detail_page', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS ingested_sales_time_source_check')
    expect(sql).toContain("'ystm_detail_page'")
    expect(sql).toContain("'explicit'")
    expect(sql).toContain("'default'")
  })
})
