import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 212 canonical sale instance key phase a', () => {
  it('adds canonical_sale_instance_key column and indexes', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/212_canonical_sale_instance_key_phase_a.sql'),
      'utf8'
    )
    expect(sql).toContain('canonical_sale_instance_key')
    expect(sql).toContain('idx_ingested_sales_canonical_sale_instance_active')
    expect(sql).toContain('idx_ingested_sales_canonical_sale_instance_published')
  })
})
