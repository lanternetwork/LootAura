import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('migration 216 public profiles to v2', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/216_migrate_public_profiles_to_v2.sql'),
    'utf8'
  )

  it('merges into lootaura_v2.profiles without dropping legacy table', () => {
    expect(sql).toContain('INSERT INTO lootaura_v2.profiles')
    expect(sql).toContain('FROM public.profiles')
    expect(sql).toContain('UPDATE lootaura_v2.profiles')
    expect(sql).not.toMatch(/DROP\s+TABLE\s+public\.profiles/i)
  })

  it('documents phase 1 gate prerequisite', () => {
    expect(sql).toMatch(/PREREQUISITE/i)
    expect(sql).toContain('profile-divergence-audit.sql')
  })
})
