import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 197 ystm coverage missing ingestion phase 3', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/197_ystm_coverage_missing_ingestion_phase_3.sql'),
    'utf8'
  )

  it('adds missing ingestion tracking columns', () => {
    expect(sql).toContain('missing_ingestion_attempted_at')
    expect(sql).toContain('missing_ingestion_outcome')
    expect(sql).toContain('missing_ingestion_failure_reason')
    expect(sql).toContain("'published'")
    expect(sql).toContain("'failed'")
  })

  it('seeds orchestration state for bounded missing URL queue', () => {
    expect(sql).toContain("'ystm_coverage_missing_ingestion'")
    expect(sql).toContain('ingestion_orchestration_state')
  })
})
