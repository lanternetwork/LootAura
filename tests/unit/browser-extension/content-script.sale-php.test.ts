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
    ) => {
      records: Array<{
        cityHint?: string
        stateHint?: string
        dateRaw?: string | null
        rawPayload?: {
          ystmQueueCardDateDiagnostics?: Record<string, unknown>
          ystmCanonicalDateStart?: string
          ystmCanonicalDateEnd?: string
        }
      }>
    }
    canonicalizeUrl: (url: string) => string
    buildCardContextByUrlFromDom: () => Record<string, { dateText?: string; title?: string; address?: string }>
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

describe('YSTM queue card context carryover', () => {
  it('buildCardContextByUrlFromDom maps .sale_date and title by canonical listing URL', () => {
    const listUrl = 'https://yardsaletreasuremap.com/US/Illinois/Griffith/foo'
    const html = `<!doctype html><html><body>
      <div class="grid-item">
        <a href="${SALE_PHP_URL}">Community sale</a>
        <div class="sale_date">Fri Sat</div>
        <h3>Town Wide</h3>
        <div class="address">100 Main St</div>
      </div>
    </body></html>`
    const dom = new JSDOM(html, { url: listUrl, runScripts: 'dangerously' })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const key = t?.canonicalizeUrl?.(SALE_PHP_URL) ?? ''
    const ctx = t?.buildCardContextByUrlFromDom?.() ?? {}
    expect(ctx[key]?.dateText).toBe('Fri Sat')
    expect(ctx[key]?.title).toContain('Town Wide')
    expect(ctx[key]?.address).toContain('100 Main St')
  })

  it('sale.php detail with empty date uses queued card Thu Fri Sat in dateRaw', () => {
    const html = `<!doctype html><html><body><p>1751 N Lafayette St 46319</p></body></html>`
    const dom = new JSDOM(html, { url: SALE_PHP_URL, runScripts: 'dangerously' })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const canon = t?.canonicalizeUrl?.(SALE_PHP_URL) ?? ''
    const session = {
      city: 'Chicago',
      state: 'IL',
      version: 2,
      cardContextByUrl: {
        [canon]: {
          title: 'Card',
          address: '1 Main',
          dateText: 'Thu Fri Sat',
          description: '',
        },
      },
    }
    const payload = t?.buildSubmissionPayload(session, SALE_PHP_URL, [])
    expect(payload?.records?.[0]?.dateRaw).toBe('Thu Fri Sat')
    const diag = payload?.records?.[0]?.rawPayload?.ystmQueueCardDateDiagnostics
    expect(diag?.dateRawFallbackUsed).toBe(true)
    expect(diag?.dateRawFallbackSource).toBe('queued_card_date')
    expect(diag?.cardContextHit).toBe(true)
    expect(diag?.lookupCanonicalUrl).toBe(canon)
  })

  it('metadata ISO dates still override queued card text', () => {
    const meta =
      '{"sales":[{"url":"https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927","date":"2026-07-15"}]}'
    const html = `<!doctype html><html><body>
      <script>metadataStr = '${meta.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';</script>
      <p>1751 N Lafayette St 46319</p>
    </body></html>`
    const dom = new JSDOM(html, { url: SALE_PHP_URL, runScripts: 'dangerously' })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const canon = t?.canonicalizeUrl?.(SALE_PHP_URL) ?? ''
    const session = {
      city: 'Chicago',
      state: 'IL',
      cardContextByUrl: {
        [canon]: { title: '', address: '', dateText: 'Thu Fri Sat', description: '' },
      },
    }
    const payload = t?.buildSubmissionPayload(session, SALE_PHP_URL, [])
    expect(payload?.records?.[0]?.dateRaw).toBe('2026-07-15')
    expect(payload?.records?.[0]?.rawPayload?.ystmQueueCardDateDiagnostics?.dateRawFallbackUsed).toBe(false)
    expect(payload?.records?.[0]?.rawPayload?.ystmCanonicalDateStart).toBe('2026-07-15')
  })

  it('explicit detail-page M/D date still overrides queued card text', () => {
    const html = `<!doctype html><html><body>
      <p>Opens 5/10/2026</p>
      <p>1751 N Lafayette St 46319</p>
    </body></html>`
    const dom = new JSDOM(html, { url: SALE_PHP_URL, runScripts: 'dangerously' })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const canon = t?.canonicalizeUrl?.(SALE_PHP_URL) ?? ''
    const session = {
      city: 'Chicago',
      state: 'IL',
      cardContextByUrl: {
        [canon]: { title: '', address: '', dateText: 'Sat Sun', description: '' },
      },
    }
    const payload = t?.buildSubmissionPayload(session, SALE_PHP_URL, [])
    expect(payload?.records?.[0]?.dateRaw).toBe('2026-05-10')
    expect(payload?.records?.[0]?.rawPayload?.ystmQueueCardDateDiagnostics?.dateRawFallbackUsed).toBe(false)
  })

  it('sessions without cardContextByUrl still build payload (no throw)', () => {
    const html = `<!doctype html><html><body><p>1751 N Lafayette St 46319</p></body></html>`
    const dom = new JSDOM(html, { url: SALE_PHP_URL, runScripts: 'dangerously' })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const payload = t?.buildSubmissionPayload(
      { city: 'Chicago', state: 'IL', version: 1, urls: [SALE_PHP_URL] },
      SALE_PHP_URL,
      []
    )
    expect(payload?.records?.[0]?.cityHint).toBe('Griffith')
    expect(payload?.records?.[0]?.rawPayload?.ystmQueueCardDateDiagnostics?.cardContextHit).toBe(false)
  })

  it('canonical URL lookup survives utm_source on current page URL', () => {
    const html = `<!doctype html><html><body><p>1751 N Lafayette St 46319</p></body></html>`
    const withUtm = `${SALE_PHP_URL}&utm_source=testsrc`
    const dom = new JSDOM(html, { url: withUtm, runScripts: 'dangerously' })
    loadContentScript(dom)
    const t = testWindow(dom).__LootAuraContentScriptTest
    const canon = t?.canonicalizeUrl?.(SALE_PHP_URL) ?? ''
    const session = {
      city: 'Chicago',
      state: 'IL',
      cardContextByUrl: {
        [canon]: { title: '', address: '', dateText: 'Sat Sun', description: '' },
      },
    }
    const payload = t?.buildSubmissionPayload(session, withUtm, [])
    expect(payload?.records?.[0]?.dateRaw).toBe('Sat Sun')
    expect(payload?.records?.[0]?.rawPayload?.ystmQueueCardDateDiagnostics?.lookupCanonicalUrl).toBe(canon)
  })
})
