import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/188_ingestion_city_configs_crawl_stats.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 188 ingestion_city_configs crawl stats', () => {
  it('adds per-config crawl yield columns', () => {
    expect(sql).toContain('source_crawl_lifetime_fetched')
    expect(sql).toContain('source_crawl_window_skipped')
    expect(sql).toContain('source_crawl_last_insert_at')
  })

  it('does not delete or disable configs', () => {
    expect(sql).not.toMatch(/DELETE FROM/i)
    expect(sql).not.toMatch(/enabled\s*=\s*false/i)
  })
})
