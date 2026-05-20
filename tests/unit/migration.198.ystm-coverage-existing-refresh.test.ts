import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 198 ystm coverage existing refresh phase 4', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/198_ystm_coverage_existing_refresh_phase_4.sql'),
    'utf8'
  )

  it('seeds orchestration state for bounded existing URL refresh', () => {
    expect(sql).toContain("'ystm_coverage_existing_refresh'")
    expect(sql).toContain('ingestion_orchestration_state')
  })
})
