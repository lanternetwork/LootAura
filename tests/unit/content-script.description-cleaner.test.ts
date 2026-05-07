/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInContext, createContext } from 'node:vm'

describe('content-script description cleaner', () => {
  beforeEach(() => {
    ;(globalThis as any).chrome = {
      runtime: { onMessage: { addListener: () => {} } },
      storage: { local: { get: (_k: unknown, cb: (value: unknown) => void) => cb({}), set: () => {}, remove: () => {} } },
    }
  })

  it('removes Street View/Directions/Source/address/date-time noise', () => {
    const source = readFileSync('C:\\LootAura\\LootAura\\browser-extension\\content-script.js', 'utf-8')
    const ctx = createContext(globalThis as any)
    runInContext(source, ctx)

    const cleaner = (globalThis as any).__LootAuraContentScriptTest?.cleanExtractedDescription
    expect(typeof cleaner).toBe('function')

    const dirty = `
      Street View
      Directions
      Source: garagesalefinder.com
      9001 W 147th St, Orland Park, IL 60462
      8:30 am - 5:00 pm
      5/9 - 5/9
      Lots of tools, furniture, and baby items available.
    `
    const cleaned = cleaner(dirty)
    expect(cleaned).toContain('Lots of tools, furniture, and baby items available.')
    expect(cleaned).not.toMatch(/Street View|Directions|Source:|Orland Park|5\/9|8:30/i)
  })
})

