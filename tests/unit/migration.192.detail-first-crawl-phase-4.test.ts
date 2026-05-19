import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('192_ingestion_detail_first_crawl_phase_4 migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/192_ingestion_detail_first_crawl_phase_4.sql'
    ),
    'utf8'
  )

  it('adds rolling detail-first crawl counters', () => {
    expect(sql).toContain('source_crawl_window_detail_first_attempted')
    expect(sql).toContain('source_crawl_window_detail_first_succeeded')
    expect(sql).toContain('source_crawl_lifetime_detail_first_attempted')
    expect(sql).toContain('source_crawl_lifetime_detail_first_succeeded')
  })
})
