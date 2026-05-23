import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 201 ystm false exclusion trace phase 1', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/201_ystm_false_exclusion_trace_phase_1.sql'),
    'utf8'
  )

  it('adds false-exclusion trace columns on observations', () => {
    expect(sql).toContain('false_exclusion_primary_bucket')
    expect(sql).toContain('false_exclusion_secondary_tags')
    expect(sql).toContain('false_exclusion_evidence')
    expect(sql).toContain('url_reuse_suspected')
    expect(sql).toContain('never_crawled')
  })

  it('indexes missing valid rows by primary bucket', () => {
    expect(sql).toContain('ystm_coverage_observations_false_exclusion_bucket_idx')
    expect(sql).toContain('lootaura_visible = false')
  })
})
