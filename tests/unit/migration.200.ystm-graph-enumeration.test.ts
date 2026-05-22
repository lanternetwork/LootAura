import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 200 ystm graph enumeration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/200_ystm_graph_enumeration_candidate_registry.sql'),
    'utf8'
  )

  it('creates candidate registry with canonical dedupe', () => {
    expect(sql).toContain('ystm_source_page_candidates')
    expect(sql).toContain('canonical_url text NOT NULL')
    expect(sql).toContain('ystm_source_page_candidates_canonical_url_idx')
    expect(sql).toContain('validation_status')
  })
})
