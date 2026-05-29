import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('migration 215 seo rollout orchestration state', () => {
  it('adds SEO rollout columns and singleton state row', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/215_seo_rollout_orchestration_state.sql'),
      'utf8'
    )
    expect(sql).toContain('seo_public_indexing_enabled')
    expect(sql).toContain('seo_crawl_validation_passed')
    expect(sql).toContain('seo_search_console_validation_passed')
    expect(sql).toContain("VALUES ('seo_rollout', 0, false)")
  })
})
