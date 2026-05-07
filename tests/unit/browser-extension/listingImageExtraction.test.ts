import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXT_ROOT = join(__dirname, '../../../browser-extension')

/** Set after loading extension script in jsdom (globalThis on `window`). */
interface WindowWithListingImage extends Window {
  LootAuraListingImage: {
    extractListingPrimaryImageUrl: (doc: Document, pageUrl: string) => string | null
  }
}

const JSDOM_SCRIPT_OPTIONS = { runScripts: 'dangerously' as const }

function loadExtractor(win: Window) {
  const code = readFileSync(join(EXT_ROOT, 'listingImageExtraction.js'), 'utf8')
  // Run in jsdom window scope so the IIFE attaches LootAuraListingImage to globalThis/window.
  win.eval(code)
}

function listingWindow(dom: JSDOM): WindowWithListingImage {
  loadExtractor(dom.window)
  return dom.window as unknown as WindowWithListingImage
}

describe('listingImageExtraction (browser extension)', () => {
  it('rejects YSTM site logo and prefers listing content image', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <header><img id="logo" src="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" width="120" height="40" alt="logo"/></header>
        <main class="content">
          <h1>Yard sale</h1>
          <img id="listing" src="/uploads/listing/photo123.jpg" width="600" height="400" alt="Garage sale items"/>
        </main>
      </body></html>`,
      {
        url: 'https://yardsaletreasuremap.com/US/Pennsylvania/Folsom/408-Tome-St/310341545/listing.html',
        ...JSDOM_SCRIPT_OPTIONS,
      }
    )
    const win = listingWindow(dom)
    const fn = win.LootAuraListingImage.extractListingPrimaryImageUrl
    const url = fn(dom.window.document, dom.window.location.href)
    expect(url).toBe('https://yardsaletreasuremap.com/uploads/listing/photo123.jpg')
  })

  it('uses data-src lazy attribute when src is placeholder', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <header><img src="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" width="100" height="30"/></header>
        <main class="content">
          <h1>Sale</h1>
          <img data-src="https://yardsaletreasuremap.com/media/big-photo.webp" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="400" height="300"/>
        </main>
      </body></html>`,
      {
        url: 'https://yardsaletreasuremap.com/US/Delaware/Newark/x/38733681/userlisting.html',
        ...JSDOM_SCRIPT_OPTIONS,
      }
    )
    const win = listingWindow(dom)
    const url = win.LootAuraListingImage.extractListingPrimaryImageUrl(
      dom.window.document,
      dom.window.location.href
    )
    expect(url).toBe('https://yardsaletreasuremap.com/media/big-photo.webp')
  })

  it('normalizes relative URL to absolute HTTPS', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <main class="content"><h1>T</h1><img src="//yardsaletreasuremap.com/photos/a.jpg" width="200" height="200"/></main>
      </body></html>`,
      {
        url: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/foo/1/listing.html',
        ...JSDOM_SCRIPT_OPTIONS,
      }
    )
    const win = listingWindow(dom)
    const url = win.LootAuraListingImage.extractListingPrimaryImageUrl(
      dom.window.document,
      dom.window.location.href
    )
    expect(url).toBe('https://yardsaletreasuremap.com/photos/a.jpg')
  })

  it('returns null when only logo-like assets exist', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <img src="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" width="120" height="40"/>
        <img src="https://yardsaletreasuremap.com/assets/favicon-32x32.png" width="32" height="32"/>
      </body></html>`,
      {
        url: 'https://yardsaletreasuremap.com/US/Pennsylvania/Philly/x/1/listing.html',
        ...JSDOM_SCRIPT_OPTIONS,
      }
    )
    const win = listingWindow(dom)
    const url = win.LootAuraListingImage.extractListingPrimaryImageUrl(
      dom.window.document,
      dom.window.location.href
    )
    expect(url).toBeNull()
  })

  it('prefers higher-tier modal image over body', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <img id="early" src="https://yardsaletreasuremap.com/pics/hero-banner.jpg" width="800" height="200"/>
        <div role="dialog" class="modal">
          <img src="https://yardsaletreasuremap.com/gallery/detail-shot.jpg" width="500" height="500"/>
        </div>
      </body></html>`,
      { url: 'https://yardsaletreasuremap.com/x/listing.html', ...JSDOM_SCRIPT_OPTIONS }
    )
    const win = listingWindow(dom)
    const url = win.LootAuraListingImage.extractListingPrimaryImageUrl(
      dom.window.document,
      dom.window.location.href
    )
    expect(url).toContain('detail-shot.jpg')
  })
})
