import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 206 ystm schema constraints phase 10', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/206_ystm_schema_constraints_phase_10.sql'),
    'utf8'
  )

  it('drops source_url uniqueness and enforces active sale_instance_key uniqueness', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS ingested_sales_source_url_uniq')
    expect(sql).toContain('ingested_sales_active_sale_instance_key_uniq')
    expect(sql).toContain('WHERE superseded_by_ingested_sale_id IS NULL')
    expect(sql).toContain('sale_instance_key IS NOT NULL')
  })

  it('dedupes duplicate active sale_instance_key rows before unique index', () => {
    expect(sql).toContain('phase_10_active_key_dedupe')
  })
})
