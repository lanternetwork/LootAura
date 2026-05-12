import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/171_sales_archive_batch_rpc.sql')
const sql = readFileSync(migrationPath, 'utf8')

describe('archive_sales_ended_batch migration SKIP LOCKED contract', () => {
  it('uses SKIP LOCKED on both ends_at and legacy pickers', () => {
    const matches = sql.match(/FOR UPDATE SKIP LOCKED/g)
    expect(matches?.length).toBe(2)
  })

  it('orders picked ids deterministically before lock', () => {
    expect(sql).toContain('ORDER BY s.id')
  })

  it('enforces positive batch limit', () => {
    expect(sql).toContain('p_batch_limit must be >= 1')
  })
})
