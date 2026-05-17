import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/184_image_enrichment_skip_recent_detail_attempt.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('image enrichment skip recent detail attempt migration (184)', () => {
  it('excludes rows with recent detailHtmlParsed image_enrichment metadata', () => {
    expect(sql).toContain("failure_details->'image_enrichment'->>'recorded_at'")
    expect(sql).toContain("failure_details->'image_enrichment'->>'detailHtmlParsed'")
    expect(sql).toContain('claim_ingested_sales_for_image_enrichment')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
  })
})
