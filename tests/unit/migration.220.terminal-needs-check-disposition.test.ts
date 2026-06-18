import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 220 terminal needs check disposition v1', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/220_terminal_needs_check_disposition_v1.sql'),
    'utf8'
  )

  it('extends address_status check with terminal disposition values', () => {
    expect(sql).toContain('address_terminal_active')
    expect(sql).toContain('address_terminal_archived')
    expect(sql).toContain('address_unavailable_terminal')
  })

  it('backfills legacy terminal rows and archives cooled inventory', () => {
    expect(sql).toContain("address_status = 'address_terminal_active'")
    expect(sql).toContain('terminalEnteredAt')
    expect(sql).toContain("address_status = 'address_terminal_archived'")
    expect(sql).toContain("interval '7 days'")
  })
})
