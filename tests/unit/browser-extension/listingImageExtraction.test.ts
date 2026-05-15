import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXT_ROOT = join(__dirname, '../../../browser-extension')

/** Set after loading extension script in jsdom (globalThis on `window`). */
interface WindowWithListingImage extends Window {
  LootAuraListingImage: {
    MAX_IMPORTED_LISTING_IMAGES: number
    extractListingPrimaryImageUrl: (doc: Document, pageUrl: string) => string | null
    extractListingImageUrls: (doc: Document, pageUrl: string, max?: number) => string[]
  }
}

const JSDOM_SCRIPT_OPTIONS = { runScripts: 'dangerously' as const }

function loadExtractor(dom: JSDOM) {
  const code = readFileSync(join(EXT_ROOT, 'listingImageExtraction.js'), 'utf8')
  // Same execution realm as the jsdom Window (requires runScripts: "dangerously").
  runInContext(code, dom.getInternalVMContext())
}

function listingWindow(dom: JSDOM): WindowWithListingImage {
  loadExtractor(dom)
  return dom.window as unknown as WindowWithListingImage
}

describe('listingImageExtraction (browser extension)', () => {
  it('exports MAX_IMPORTED_LISTING_IMAGES aligned with backend cap (10)', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://yardsaletreasuremap.com/x/listing.html',
      ...JSDOM_SCRIPT_OPTIONS,
    })
    const win = listingWindow(dom)
    expect(win.LootAuraListingImage.MAX_IMPORTED_LISTING_IMAGES).toBe(10)
  })

  it('returns up to 10 distinct ranked listing images when many are present', () => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const id = String(i + 1).padStart(2, '0')
      return `<img src="https://yardsaletreasuremap.com/uploads/listing/img${id}.jpg" width="600" height="400" alt="p${id}"/>`
    }).join('\n')
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <main class="content"><h1>Yard sale</h1>${rows}</main>
      </body></html>`,
      {
        url: 'https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn/x/1/listing.html',
        ...JSDOM_SCRIPT_OPTIONS,
      }
    )
    const win = listingWindow(dom)
    const { extractListingImageUrls, MAX_IMPORTED_LISTING_IMAGES } = win.LootAuraListingImage
    const urls = extractListingImageUrls(dom.window.document, dom.window.location.href, MAX_IMPORTED_LISTING_IMAGES)
    expect(urls).toHaveLength(10)
    expect(new Set(urls).size).toBe(10)
    expect(extractListingImageUrls(dom.window.document, dom.window.location.href, MAX_IMPORTED_LISTING_IMAGES)).toEqual(
      urls
    )
  })

  it('still caps at caller max when below 10', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <main class="content">
          <h1>Sale</h1>
          ${[1, 2, 3, 4, 5]
            .map(
              (n) =>
                `<img src="https://yardsaletreasuremap.com/uploads/a${n}.jpg" width="600" height="400"/>`
            )
            .join('')}
        </main>
      </body></html>`,
      { url: 'https://yardsaletreasuremap.com/x/listing.html', ...JSDOM_SCRIPT_OPTIONS }
    )
    const win = listingWindow(dom)
    const urls = win.LootAuraListingImage.extractListingImageUrls(dom.window.document, dom.window.location.href, 3)
    expect(urls).toHaveLength(3)
  })

  it('dedupes identical image URLs across multiple img elements', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <main class="content">
          <h1>Sale</h1>
          <img src="https://yardsaletreasuremap.com/uploads/same.jpg" width="600" height="400"/>
          <img src="https://yardsaletreasuremap.com/uploads/same.jpg" width="500" height="400"/>
          <img src="https://yardsaletreasuremap.com/uploads/other.jpg" width="600" height="400"/>
        </main>
      </body></html>`,
      { url: 'https://yardsaletreasuremap.com/x/listing.html', ...JSDOM_SCRIPT_OPTIONS }
    )
    const win = listingWindow(dom)
    const urls = win.LootAuraListingImage.extractListingImageUrls(dom.window.document, dom.window.location.href, 10)
    expect(urls).toEqual([
      'https://yardsaletreasuremap.com/uploads/same.jpg',
      'https://yardsaletreasuremap.com/uploads/other.jpg',
    ])
  })

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

  it('returns ordered multi-image candidates for listing pages', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <header><img src="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" width="120" height="40"/></header>
        <main class="content">
          <h1>Yard sale</h1>
          <img src="https://yardsaletreasuremap.com/uploads/listing/photo1.jpg" width="600" height="400" />
          <img src="https://yardsaletreasuremap.com/uploads/listing/photo2.jpg" width="500" height="350" />
        </main>
      </body></html>`,
      {
        url: 'https://yardsaletreasuremap.com/US/Pennsylvania/Folsom/408-Tome-St/310341545/listing.html',
        ...JSDOM_SCRIPT_OPTIONS,
      }
    )
    const win = listingWindow(dom)
    const urls = win.LootAuraListingImage.extractListingImageUrls(
      dom.window.document,
      dom.window.location.href,
      3
    )
    expect(urls).toEqual([
      'https://yardsaletreasuremap.com/uploads/listing/photo1.jpg',
      'https://yardsaletreasuremap.com/uploads/listing/photo2.jpg',
    ])
    const primary = win.LootAuraListingImage.extractListingPrimaryImageUrl(
      dom.window.document,
      dom.window.location.href
    )
    expect(primary).toBe(urls[0])
  })
})
