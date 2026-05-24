import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('migration 208 coverage bootstrap nationwide', () => {
  it('adds bootstrap columns and singleton state row', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/208_coverage_bootstrap_nationwide.sql'),
      'utf8'
    )
    expect(sql).toContain('coverage_bootstrap_enabled')
    expect(sql).toContain('coverage_bootstrap_nationwide')
    expect(sql).toContain("coverage_bootstrap_enabled = false")
  })
})
