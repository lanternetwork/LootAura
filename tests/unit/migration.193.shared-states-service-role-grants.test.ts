import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('193_shared_states_service_role_grants migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/193_shared_states_service_role_grants.sql'),
    'utf8'
  )

  it('grants service_role access to lootaura_v2.shared_states', () => {
    expect(sql).toContain('shared_states_service_role_all')
    expect(sql).toContain('FOR ALL TO service_role')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.shared_states TO service_role')
  })
})
