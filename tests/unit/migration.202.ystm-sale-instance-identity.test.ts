import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 202 ystm sale instance identity phase 3', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/202_ystm_sale_instance_identity_phase_3.sql'),
    'utf8'
  )

  it('adds sale-instance identity columns on ingested_sales', () => {
    expect(sql).toContain('source_listing_id')
    expect(sql).toContain('sale_instance_key')
    expect(sql).toContain('sale_instance_fingerprint')
    expect(sql).toContain('source_payload_hash')
    expect(sql).toContain('superseded_by_ingested_sale_id')
    expect(sql).toContain('superseded_sale_id')
  })

  it('indexes sale_instance_key for observability queries', () => {
    expect(sql).toContain('ingested_sales_sale_instance_key_idx')
    expect(sql).toContain('sale_instance_key IS NOT NULL')
  })
})
