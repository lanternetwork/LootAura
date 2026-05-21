import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 196 ystm coverage audit phase 1', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/196_ystm_coverage_audit_phase_1.sql'),
    'utf8'
  )

  it('creates observations and audit run tables', () => {
    expect(sql).toContain('ystm_coverage_observations')
    expect(sql).toContain('ystm_coverage_audit_runs')
    expect(sql).toContain('canonical_url text PRIMARY KEY')
    expect(sql).toContain('coverage_pct numeric')
  })

  it('seeds orchestration state for bounded audit cursor', () => {
    expect(sql).toContain("'ystm_coverage_audit'")
    expect(sql).toContain('ingestion_orchestration_state')
  })
})
