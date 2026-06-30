import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Profile architecture spec completion guards', () => {
  it('only migration 217 may drop public.profiles', () => {
    const migrationsDir = join(process.cwd(), 'supabase/migrations')
    const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    const dropLegacy = sqlFiles.filter((file) => {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      return /DROP\s+TABLE\s+.*public\.profiles/i.test(sql)
    })
    expect(dropLegacy).toEqual(['217_drop_legacy_public_profiles.sql'])
  })

  it('T table constant no longer exposes legacy profiles name', () => {
    const source = readFileSync(join(process.cwd(), 'lib/supabase/tables.ts'), 'utf8')
    expect(source).not.toMatch(/profiles:\s*['"]profiles['"]/)
  })
})
