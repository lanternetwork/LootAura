import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 211 esnet provider runtime state', () => {
  it('defines DB-backed ingest and bootstrap keys', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/211_esnet_provider_runtime_state.sql'),
      'utf8'
    )
    expect(sql).toContain('provider_ingest_enabled')
    expect(sql).toContain('esnet_ingest_enabled')
    expect(sql).toContain('esnet_bootstrap_enabled')
  })
})
