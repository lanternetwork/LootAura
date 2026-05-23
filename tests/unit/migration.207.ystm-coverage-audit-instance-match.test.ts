import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 207 ystm coverage audit instance match phase 11', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/207_ystm_coverage_audit_instance_match_phase_11.sql'),
    'utf8'
  )

  it('adds sale-instance match columns on coverage observations', () => {
    expect(sql).toContain('sale_instance_key')
    expect(sql).toContain('matched_ingested_sale_id')
    expect(sql).toContain('matched_sale_id')
    expect(sql).toContain('match_method')
  })
})
