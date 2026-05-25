import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('migration 210 source discovery estatesales net', () => {
  it('inserts provider-scoped discovery state row', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/210_source_discovery_estatesales_net.sql'),
      'utf8'
    )
    expect(sql).toContain('source_discovery_estatesales_net')
  })
})
