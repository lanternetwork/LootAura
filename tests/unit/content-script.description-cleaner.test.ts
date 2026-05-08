/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTENT_SCRIPT = readFileSync(join(__dirname, '../../browser-extension/content-script.js'), 'utf8')

type WindowWithContentScriptTest = Window & {
  chrome?: {
    runtime: { onMessage: { addListener: () => void } }
    storage: {
      local: {
        get: (_k: string, cb: (obj: Record<string, unknown>) => void) => void
        set: (_d: unknown, cb?: () => void) => void
        remove: (_k: string, cb?: () => void) => void
      }
    }
  }
  __LootAuraContentScriptTest?: { cleanExtractedDescription: (raw: string) => string }
}

function installChrome(win: WindowWithContentScriptTest) {
  win.chrome = {
    runtime: { onMessage: { addListener: () => {} } },
    storage: {
      local: {
        get: (_k, cb) => {
          cb({})
        },
        set: (_d, cb) => {
          cb?.()
        },
        remove: (_k, cb) => {
          cb?.()
        },
      },
    },
  }
}

function loadContentScript(dom: JSDOM) {
  installChrome(dom.window as unknown as WindowWithContentScriptTest)
  runInContext(CONTENT_SCRIPT, dom.getInternalVMContext())
}

describe('content-script description cleaner', () => {
  it('removes Street View/Directions/Source/address/date-time noise', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/listing',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)

    const win = dom.window as unknown as WindowWithContentScriptTest
    const cleaner = win.__LootAuraContentScriptTest?.cleanExtractedDescription
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
    const cleaned = cleaner!(dirty)
    expect(cleaned).toContain('Lots of tools, furniture, and baby items available.')
    expect(cleaned).not.toMatch(/Street View|Directions|Source:|Orland Park|5\/9|8:30/i)
  })

  it('strips inline pollution from single-line mixed description', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/listing',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const win = dom.window as unknown as WindowWithContentScriptTest
    const cleaner = win.__LootAuraContentScriptTest?.cleanExtractedDescription
    expect(typeof cleaner).toBe('function')

    const dirty =
      'Lots of new bikes and toys for kids. 8:30 am - 5:00 pm 5/9 - 5/9 9001 W 147th St, Orland Park, IL 60462 Street View Directions Source: garagesalefinder.com'
    const cleaned = cleaner!(dirty)
    expect(cleaned).toBe('Lots of new bikes and toys for kids.')
  })

  it('strips weekday-prefixed ranges, labeled times, CTA junk, and zip/country tails', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/listing',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const win = dom.window as unknown as WindowWithContentScriptTest
    const cleaner = win.__LootAuraContentScriptTest?.cleanExtractedDescription
    expect(typeof cleaner).toBe('function')

    const dirty =
      'Great furniture and toys. Fri 5/8 Start time: 8am Starts at 9:30am For more information please visit us at click here see listing 46307, USA'
    const cleaned = cleaner!(dirty)
    expect(cleaned).toBe('Great furniture and toys.')
  })
})
