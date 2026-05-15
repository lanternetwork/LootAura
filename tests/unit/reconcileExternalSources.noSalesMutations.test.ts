import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Phase 1B guard: reconciliation must not write public `sales`.
 * Execution path uses `sales` only for candidate discovery (SELECT).
 */
describe('reconcileExternalSources (static)', () => {
  it('uses fromBase(admin, sales) only as a single select chain', () => {
    const path = join(process.cwd(), 'lib/reconciliation/reconcileExternalSources.ts')
    const src = readFileSync(path, 'utf8')
    const matches = [...src.matchAll(/fromBase\(admin, 'sales'\)/g)]
    expect(matches.length).toBe(1)
    const idx = matches[0]!.index!
    const window = src.slice(idx, idx + 400)
    expect(window).toMatch(/\.select\(/)
    expect(window).not.toMatch(/\.update\s*\(/)
  })

  it('defaults omitted dryRun to read-only persistence (library safety)', () => {
    const path = join(process.cwd(), 'lib/reconciliation/reconcileExternalSources.ts')
    const src = readFileSync(path, 'utf8')
    expect(src).toMatch(/const\s+dryRun\s*=\s*options\?\.dryRun\s*!==\s*false/)
  })
})
