import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('migration 217 drop legacy public.profiles', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/217_drop_legacy_public_profiles.sql'),
    'utf8'
  )

  it('fails closed when only_public remains and is idempotent if already dropped', () => {
    expect(sql).toContain('only_public')
    expect(sql).toContain('RAISE EXCEPTION')
    expect(sql).toContain("to_regclass('public.profiles') IS NULL")
    expect(sql).toContain('DROP TABLE public.profiles')
  })

  it('does not drop profiles_v2 or lootaura_v2.profiles', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE\s+.*profiles_v2/i)
    expect(sql).not.toMatch(/DROP\s+TABLE\s+lootaura_v2\.profiles/i)
  })
})
