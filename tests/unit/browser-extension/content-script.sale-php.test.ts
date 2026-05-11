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
const ZIP_LOCALITY_RESOLVER = readFileSync(
  join(__dirname, '../../../browser-extension/zipLocalityResolver.js'),
  'utf8'
)
const CONTENT_SCRIPT = readFileSync(join(__dirname, '../../../browser-extension/content-script.js'), 'utf8')

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
    resolveSalePhpCommunityCityState: (
      pageUrl: string,
      addressRaw: string | null
    ) => { city: string; state: string; source: string; confidence?: string } | null
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
        get: (_k, cb) => cb({}),
        set: (_d, cb) => cb?.(),
        remove: (_k, cb) => cb?.(),
      },
    },
  }
}

function loadContentScript(dom: JSDOM) {
  installChrome(testWindow(dom))
  runInContext(ZIP_LOCALITY_RESOLVER, dom.getInternalVMContext())
  runInContext(CONTENT_SCRIPT, dom.getInternalVMContext())
}

const SALE_PHP_URL = 'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927'
const SALE_PHP_SAME_COMMUNITY_OTHER_ID =
  'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=777777'
const SALE_PHP_OTHER_COMMUNITY = 'https://yardsaletreasuremap.com/sale.php?communitysale=99999&id=1'
const LISTING_HTML_URL =
  'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730001/listing.html'
const USERLISTING_HTML_URL =
  'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730001/userlisting.html'

describe('YSTM sale.php community sale ZIP locality authority', () => {
  it('queues listing.html and userlisting.html hrefs (unchanged)', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.shouldQueueYstmUrl(LISTING_HTML_URL)).toBe(true)
    expect(t?.shouldQueueYstmUrl(USERLISTING_HTML_URL)).toBe(true)
  })

  it('resolveSalePhpCommunityCityState uses zip_locality_authority for Griffith street+ZIP', () => {
    const dom = new JSDOM('<!doctype html><html><body><p>1751 N Lafayette St 46319</p></body></html>', {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1751 N Lafayette St 46319')
    expect(out).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source: 'zip_locality_authority',
      confidence: 'primary_zip_match',
    })
  })

  it('communitysale cache seeds from zip_locality_authority and later same communitysale id uses cache', () => {
    const dom = new JSDOM('<!doctype html><html><body><p>1751 N Lafayette St 46319</p></body></html>', {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const first = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1751 N Lafayette St 46319')
    expect(first?.source).toBe('zip_locality_authority')

    dom.window.document.body.innerHTML = `
      <a id="prev" href="https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=111">prev</a>
      <a id="next" href="https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=222">next</a>
      <p>111 Unknown Ave 99999</p>
    `
    const second = t?.resolveSalePhpCommunityCityState(
      SALE_PHP_SAME_COMMUNITY_OTHER_ID,
      '111 Unknown Ave 99999'
    )
    expect(second).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source: 'communitysale_session_cache',
    })
  })

  it('different communitysale id does not reuse cache', () => {
    const dom = new JSDOM('<!doctype html><html><body><p>1751 N Lafayette St 46319</p></body></html>', {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1751 N Lafayette St 46319')?.source).toBe(
      'zip_locality_authority'
    )

    dom.window.document.body.innerHTML = '<p>111 Other St 99999</p>'
    const other = t?.resolveSalePhpCommunityCityState(SALE_PHP_OTHER_COMMUNITY, '111 Other St 99999')
    expect(other).toBeNull()
  })

  it('neighbor canonical URL no longer authorizes locality', () => {
    const html = `<!doctype html><html><body>
      <a id="next" href="https://yardsaletreasuremap.com/US/Indiana/Griffith/100-Main-St/1/listing.html">next</a>
      <p>111 Unknown Ave 99999</p>
    </body></html>`
    const dom = new JSDOM(html, {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '111 Unknown Ave 99999')
    expect(out).toBeNull()
  })

  it('unknown ZIP fails closed', () => {
    const dom = new JSDOM('<!doctype html><html><body><p>111 Unknown Ave 99999</p></body></html>', {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '111 Unknown Ave 99999')).toBeNull()
  })

  it('ambiguous ZIP fails closed', () => {
    const dom = new JSDOM('<!doctype html><html><body><p>111 Ambiguous Ave 60601</p></body></html>', {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    expect(t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '111 Ambiguous Ave 60601')).toBeNull()
  })

  it('expectedState mismatch fails closed in ZIP resolver contract', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: SALE_PHP_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const api = (dom.window as unknown as { LootAuraZipLocalityResolver?: {
      resolveZipLocalityAuthority: (input: { zip: string; expectedState?: string }) => unknown
    } }).LootAuraZipLocalityResolver
    expect(api?.resolveZipLocalityAuthority({ zip: '46319', expectedState: 'IL' }) ?? null).toBeNull()
  })

  it('buildSubmissionPayload on listing.html remains unchanged', () => {
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

  it('buildSubmissionPayload on userlisting.html remains unchanged', () => {
    const html = `<!doctype html><html><body><p>456 Oak Ave, Fair Oaks, IN 46321</p></body></html>`
    const dom = new JSDOM(html, {
      url: USERLISTING_HTML_URL,
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const payload = t?.buildSubmissionPayload({ city: 'Chicago', state: 'IL' }, USERLISTING_HTML_URL, [])
    expect(payload?.records?.[0]?.cityHint).toBe('Fair Oaks')
    expect(payload?.records?.[0]?.stateHint).toBe('IN')
  })
})
