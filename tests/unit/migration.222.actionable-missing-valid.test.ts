import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 222 actionable missing valid terminal disposition v1', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/222_actionable_missing_valid_terminal_disposition_v1.sql'),
    'utf8'
  )

  it('adds terminal_disposition false-exclusion primary bucket', () => {
    expect(sql).toContain("'terminal_disposition'")
    expect(sql).toContain('ystm_coverage_observations_false_exclusion_bucket_chk')
  })
})
