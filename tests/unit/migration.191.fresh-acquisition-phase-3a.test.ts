import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('migration 191 fresh acquisition phase 3a', () => {
  it('adds crawl stats columns for expired and classified duplicates', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/191_ingestion_fresh_acquisition_phase_3a.sql'),
      'utf8'
    )
    expect(sql).toContain('source_crawl_window_skipped_expired')
    expect(sql).toContain('source_crawl_window_fresh_inserted')
    expect(sql).toContain('source_crawl_window_dup_existing_url')
  })
})
