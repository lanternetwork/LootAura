import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/177_ingestion_discovery_state_and_crawl_exclusion.sql'),
  'utf8'
)

describe('migration 177 ingestion discovery state', () => {
  it('creates discovery state table with lease columns', () => {
    expect(sql).toContain('ingestion_discovery_state')
    expect(sql).toContain('state_cursor')
    expect(sql).toContain('lease_owner')
    expect(sql).toContain('ystm_nationwide')
  })

  it('adds crawl exclusion and failure count columns', () => {
    expect(sql).toContain('source_crawl_excluded_at')
    expect(sql).toContain('source_discovery_failure_count')
  })
})
