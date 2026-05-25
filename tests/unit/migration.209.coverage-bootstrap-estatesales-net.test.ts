import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('migration 209 coverage bootstrap estatesales net', () => {
  it('inserts provider-scoped bootstrap state row', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/209_coverage_bootstrap_estatesales_net.sql'),
      'utf8'
    )
    expect(sql).toContain('coverage_bootstrap_estatesales_net')
    expect(sql).toContain("VALUES ('coverage_bootstrap_estatesales_net', 0, false)")
  })
})
