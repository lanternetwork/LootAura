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

type TestWin = Window & {
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

function installChrome(win: TestWin) {
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
  installChrome(dom.window as TestWin)
  runInContext(CONTENT_SCRIPT, dom.getInternalVMContext())
}

const SALE_PHP_URL =
  'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927'

describe('YSTM sale.php community sale (extension)', () => {
  it('queues listing.html and userlisting.html hrefs', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
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
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
    expect(t?.shouldQueueYstmUrl(SALE_PHP_URL)).toBe(true)
  })

  it('does not queue sale.php without communitysale on YSTM', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
    expect(t?.shouldQueueYstmUrl('https://yardsaletreasuremap.com/sale.php?id=1')).toBe(false)
  })

  it('does not queue sale.php communitysale on non-YSTM host', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/',
      runScripts: 'dangerously',
    })
    loadContentScript(dom)
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
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
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1751 N Lafayette St 46319')
    expect(out).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source: 'metadata_sale_address',
    })
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
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
    const out = t?.resolveSalePhpCommunityCityState(SALE_PHP_URL, '1751 N Lafayette St 46319')
    expect(out).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source: 'page_text_comma_before_zip',
    })
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
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
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
    const t = (dom.window as TestWin).__LootAuraContentScriptTest
    expect(() =>
      t?.buildSubmissionPayload({ city: 'Chicago', state: 'IL' }, SALE_PHP_URL, [])
    ).toThrow(/community sale/)
  })
})
