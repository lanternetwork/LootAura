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
const EXT = join(__dirname, '../../browser-extension')
const LISTING_IMAGE_SCRIPT = readFileSync(join(EXT, 'listingImageExtraction.js'), 'utf8')
const CONTENT_SCRIPT = readFileSync(join(EXT, 'content-script.js'), 'utf8')

type WindowWithImageHarness = Window & {
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
  __LootAuraContentScriptTest?: {
    extractImages: () => { primary: string | null; urls: string[] }
  }
}

function installChrome(win: WindowWithImageHarness) {
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

function loadScripts(dom: JSDOM) {
  installChrome(dom.window as unknown as WindowWithImageHarness)
  runInContext(LISTING_IMAGE_SCRIPT, dom.getInternalVMContext())
  runInContext(CONTENT_SCRIPT, dom.getInternalVMContext())
}

describe('content-script extractImages wiring', () => {
  it('uses LootAuraListingImage MAX cap and returns up to 10 urls', () => {
    const rows = Array.from({ length: 11 }, (_, i) => {
      const id = String(i + 1).padStart(2, '0')
      return `<img src="https://yardsaletreasuremap.com/uploads/listing/cap${id}.jpg" width="600" height="400"/>`
    }).join('')
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <main class="content"><h1>Yard sale</h1>${rows}</main>
      </body></html>`,
      {
        url: 'https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn/x/310/listing.html',
        runScripts: 'dangerously',
      }
    )
    loadScripts(dom)
    const win = dom.window as unknown as WindowWithImageHarness
    const extract = win.__LootAuraContentScriptTest?.extractImages
    expect(typeof extract).toBe('function')
    const { primary, urls } = extract!()
    expect(urls.length).toBe(10)
    expect(primary).toBe(urls[0])
    expect(new Set(urls).size).toBe(10)
  })
})
