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
const CONTENT_SCRIPT = readFileSync(join(__dirname, '../../../browser-extension/content-script.js'), 'utf8')

/** Narrow jsdom window shape for tests — do not extend global `Window` (avoids DOMWindow vs Window TS2352). */
type LootAuraDomWindow = {
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
    shouldQueueYstmUrl: (href: string) => boolean
    isYstmCommunitySalePhpPage: (href: string) => boolean
    resolveSalePhpCommunityCityState: (
      pageUrl: string,
      addressRaw: string | null
    ) => { city: string; state: string; source: string } | null
    buildSubmissionPayload: (
      session: Record<string, unknown>,
      url: string,
      tags: string[]
    ) => { records: Array<{ cityHint?: string; stateHint?: string }> }
  }
}

function testWindow(dom: JSDOM): LootAuraDomWindow {
  return dom.window as unknown as LootAuraDomWindow
}

function installChrome(win: LootAuraDomWindow) {
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
  installChrome(testWindow(dom))
  runInContext(CONTENT_SCRIPT, dom.getInternalVMContext())
}

const SALE_PHP_URL =
  'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927'

const LISTING_HTML_URL =
  'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730001/listing.html'

describe('YSTM sale.php community sale (extension)', () => {
  it('queues listing.html and userlisting.html hrefs', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.shouldQueueYstmUrl('https://yardsaletreasuremap.com/US/Illinois/Antioch/101-Main-St/100/listing.html')).toBe(
      true
    )
    expect(
      t?.shouldQueueYstmUrl(
        'https://yardsaletreasuremap.com/US/Illinois/Antioch/101-Main-St/100/userlisting.html'
      )
    ).toBe(true)
  })

  it('queues yardsaletreasuremap.com sale.php?communitysale=', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.shouldQueueYstmUrl(SALE_PHP_URL)).toBe(true)
  })

  it('does not queue sale.php without communitysale on YSTM', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.shouldQueueYstmUrl('https://yardsaletreasuremap.com/sale.php?id=1')).toBe(false)
  })

  it('does not queue sale.php communitysale on non-YSTM host', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.shouldQueueYstmUrl('https://evil.example/sale.php?communitysale=1&id=1')).toBe(false)
  })

  it('resolveSalePhpCommunityCityState uses metadata sale.address', () => {
    const metaObj = {
      sales: [
        {
          url: SALE_PHP_URL,
          address: '1751 N Lafayette St, Griffith, IN 46319',
        },
      ],
    }
    const metaInner = JSON.stringify(metaObj).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const html = `<!doctype html><html><body><script>const metadataStr = '${metaInner}';</script><p>1751 N Lafayette St 46319</p></body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1751 N Lafayette St 46319')
    expect(out).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source: 'metadata_sale_address',
    })
  })

  it('resolveSalePhpCommunityCityState uses neighbor canonical /US/… URL before page-text ZIP', () => {
    const html = `<!doctype html><html><body>
      <h1>Griffith Town-Wide Garage Sale Spring 2026</h1>
      <a id="prev" href="https://yardsaletreasuremap.com/US/Indiana/see-source/100-Main/1/listing.html">prev</a>
      <a id="next" href="https://yardsaletreasuremap.com/US/Indiana/Griffith/100-Main-St/1/listing.html">next</a>
      <p>1946 West Ash St 46319</p>
    </body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1946 West Ash St 46319')
    expect(out).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source: 'neighbor_canonical_ystm_url',
    })
  })

  it('resolveSalePhpCommunityCityState does not use placeholder neighbor /US/… slugs', () => {
    const html = `<!doctype html><html><body>
      <a id="prev" href="https://yardsaletreasuremap.com/US/Indiana/see-source/100-Main/1/listing.html">prev</a>
      <a id="next" href="https://yardsaletreasuremap.com/US/Illinois/address-after/200-Oak/2/listing.html">next</a>
      <p>1946 West Ash St 46319</p>
    </body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1946 West Ash St 46319')
    expect(out).toBeNull()
  })

  it('resolveSalePhpCommunityCityState uses page text City, ST ZIP near street ZIP', () => {
    const html = `<!doctype html><html><body>
      <p>Griffith, IN 46319</p>
      <p>1751 N Lafayette St 46319</p>
    </body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1751 N Lafayette St 46319')
    expect(out).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source: 'page_text_comma_before_zip',
    })
  })

  it('buildSubmissionPayload succeeds for Griffith-style sale.php via neighbor canonical authority', () => {
    const html = `<!doctype html><html><body>
      <h1>Griffith Town-Wide Garage Sale Spring 2026</h1>
      <a id="next" href="https://yardsaletreasuremap.com/US/Indiana/Griffith/1946-West-Ash-St/218927/listing.html">next</a>
      <p>1946 West Ash St 46319</p>
    </body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const payload = t?.buildSubmissionPayload({ city: 'Chicago', state: 'IL' }, SALE_PHP_URL, [])
    expect(payload?.records?.[0]?.cityHint).toBe('Griffith')
    expect(payload?.records?.[0]?.stateHint).toBe('IN')
  })

  it('buildSubmissionPayload succeeds when metadata supplies City, ST for street+ZIP display', () => {
    const metaObj = {
      sales: [
        {
          url: SALE_PHP_URL,
          address: '1751 N Lafayette St, Griffith, IN 46319',
          date: '2026-05-10',
        },
      ],
    }
    const metaInner = JSON.stringify(metaObj).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const html = `<!doctype html><html><body><h1>Town sale</h1><script>const metadataStr = '${metaInner}';</script><p>1751 N Lafayette St 46319</p></body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const payload = t?.buildSubmissionPayload(
      { city: 'Chicago', state: 'IL' },
      SALE_PHP_URL,
      []
    )
    expect(payload?.records?.[0]?.cityHint).toBe('Griffith')
    expect(payload?.records?.[0]?.stateHint).toBe('IN')
  })

  it('buildSubmissionPayload throws when community sale has no metadata or City, ST ZIP on page', () => {
    const html = `<!doctype html><html><body><h1>Sale</h1><p>1751 N Lafayette St 46319</p></body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(() =>
      t?.buildSubmissionPayload({ city: 'Chicago', state: 'IL' }, SALE_PHP_URL, [])
    ).toThrow(/community sale/)
  })

  it('buildSubmissionPayload still fails closed when only placeholder neighbor /US/ links exist', () => {
    const html = `<!doctype html><html><body><h1>Sale</h1>
      <a id="prev" href="https://yardsaletreasuremap.com/US/Indiana/see-source/100-Main/1/listing.html">prev</a>
      <a id="next" href="https://yardsaletreasuremap.com/US/Illinois/address-after/200-Oak/2/listing.html">next</a>
      <p>1751 N Lafayette St 46319</p>
    </body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(() =>
      t?.buildSubmissionPayload({ city: 'Chicago', state: 'IL' }, SALE_PHP_URL, [])
    ).toThrow(/community sale/)
  })

  it('buildSubmissionPayload on listing.html still resolves from canonical YSTM URL + address (unchanged)', () => {
    const html = `<!doctype html><html><body><p>123 Main St, Fair Oaks, IN 46321</p></body></html>`
    const dom = new JSDOM(html, {
      url: LISTING_HTML_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const payload = t?.buildSubmissionPayload({ city: 'Chicago', state: 'IL' }, LISTING_HTML_URL, [])
    expect(payload?.records?.[0]?.cityHint).toBe('Fair Oaks')
    expect(payload?.records?.[0]?.stateHint).toBe('IN')
  })

  it('buildSubmissionPayload on userlisting.html still resolves from canonical YSTM URL + address (unchanged)', () => {
    const userUrl =
      'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730001/userlisting.html'
    const html = `<!doctype html><html><body><p>456 Oak Ave, Fair Oaks, IN 46321</p></body></html>`
    const dom = new JSDOM(html, {
      url: userUrl,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const payload = t?.buildSubmissionPayload({ city: 'Chicago', state: 'IL' }, userUrl, [])
    expect(payload?.records?.[0]?.cityHint).toBe('Fair Oaks')
    expect(payload?.records?.[0]?.stateHint).toBe('IN')
  })
})
