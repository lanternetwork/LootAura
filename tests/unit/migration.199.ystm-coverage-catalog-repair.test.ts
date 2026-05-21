import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 199 ystm coverage catalog repair phase 5', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/199_ystm_coverage_catalog_repair_phase_5.sql'),
    'utf8'
  )

  it('adds catalog repair tracking on ingested_sales', () => {
    expect(sql).toContain('catalog_repair_attempted_at')
    expect(sql).toContain('catalog_repair_outcome')
    expect(sql).toContain("'published'")
    expect(sql).toContain("'geocoded'")
  })

  it('seeds orchestration state for bounded catalog repair', () => {
    expect(sql).toContain("'ystm_coverage_catalog_repair'")
    expect(sql).toContain('ingestion_orchestration_state')
  })
})
