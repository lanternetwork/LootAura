import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DISCOVERY_DIR = join(process.cwd(), 'lib/ingestion/discovery')

describe('ystm discovery subsystem', () => {
  it('does not reference ingestion_city_configs or Supabase clients', () => {
    const files = [
      'ystmDiscovery.ts',
      'ystmDiscoveryValidator.ts',
      'ystmStateIndexCatalog.ts',
      'ystmDiscoveryTelemetry.ts',
    ]
    for (const file of files) {
      const src = readFileSync(join(DISCOVERY_DIR, file), 'utf8')
      expect(src).not.toMatch(/ingestion_city_configs/)
      expect(src).not.toMatch(/getAdminDb|fromBase\(/)
    }
  })
})
