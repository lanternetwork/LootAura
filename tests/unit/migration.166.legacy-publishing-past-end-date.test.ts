import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/166_legacy_publishing_past_end_date_validation_cleanup.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 166 legacy publishing past_end_date validation cleanup', () => {
  it('moves publishing + validation past_end_date + null published_sale_id to expired', () => {
    expect(sql).toContain("s.status = 'publishing'")
    expect(sql).toContain('s.published_sale_id IS NULL')
    expect(sql).toContain("= 'past_end_date'")
    expect(sql).toContain("= 'validation'")
    expect(sql).toContain("status = 'expired'")
    expect(sql).toContain("'sale_expired'")
    expect(sql).toContain("e <> 'publish_error'")
  })

  it('does not overwrite failure_details in the UPDATE', () => {
    expect(sql.toLowerCase()).not.toMatch(/set\s+[\s\S]*failure_details\s*=/i)
  })

  it('claim RPC publishing reclaim excludes validation past_end_date rows', () => {
    expect(sql).toContain("s.status = 'publishing'")
    expect(sql).toContain('NOT (')
    expect(sql).toContain("(s.failure_details->>'reason') = 'past_end_date'")
    expect(sql).toContain("(s.failure_details->>'phase') = 'validation'")
  })
})
