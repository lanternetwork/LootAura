import { getSeoBaseUrl } from '@/lib/seo/constants'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'
import { getCityPagePath, getListingCanonicalPath, getWeekendPagePath } from '@/lib/seo/canonical'

export type CrawlSmokeCheck = {
  id: string
  label: string
  url: string
  pass: boolean
  detail: string
}

export type CrawlSmokeReport = {
  generatedAt: string
  baseUrl: string
  passed: boolean
  checks: CrawlSmokeCheck[]
}

const CRAWL_TIMEOUT_MS = 15_000

async function fetchHtml(url: string): Promise<{ ok: boolean; html: string; status: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html', 'User-Agent': 'LootAura-SeoCrawlSmoke/1.0' },
      cache: 'no-store',
    })
    const html = await res.text()
    return { ok: res.ok, html, status: res.status }
  } finally {
    clearTimeout(timer)
  }
}

function check(
  id: string,
  label: string,
  url: string,
  pass: boolean,
  detail: string
): CrawlSmokeCheck {
  return { id, label, url, pass, detail }
}

/**
 * Phase 5B — HTTP smoke checks for SSR crawl markers on live/staging HTML.
 */
export async function runSeoCrawlSmokeChecks(options?: {
  baseUrl?: string
  metroSlug?: string
  sampleSaleId?: string
}): Promise<CrawlSmokeReport> {
  const baseUrl = (options?.baseUrl ?? getSeoBaseUrl()).replace(/\/$/, '')
  const metro = SEO_PILOT_METROS.find((m) => m.slug === (options?.metroSlug ?? 'dallas-tx')) ?? SEO_PILOT_METROS[0]
  const checks: CrawlSmokeCheck[] = []

  const cityUrl = `${baseUrl}${getCityPagePath(metro.slug)}`
  const cityRes = await fetchHtml(cityUrl)
  const cityHasH1 = /<h1\b/i.test(cityRes.html)
  const cityHasListingLinks = /href=["']\/sales\/[^"']+["']/i.test(cityRes.html)
  checks.push(
    check(
      'city_status',
      'City page returns HTML',
      cityUrl,
      cityRes.ok,
      cityRes.ok ? `HTTP ${cityRes.status}` : `HTTP ${cityRes.status}`
    ),
    check(
      'city_inventory_html',
      'City page lists crawlable sale links',
      cityUrl,
      cityHasH1 && cityHasListingLinks,
      cityHasH1 && cityHasListingLinks
        ? 'H1 and /sales/ links present'
        : `h1=${cityHasH1} listingLinks=${cityHasListingLinks}`
    )
  )

  const weekendUrl = `${baseUrl}${getWeekendPagePath(metro.slug)}`
  const weekendRes = await fetchHtml(weekendUrl)
  checks.push(
    check(
      'weekend_status',
      'Weekend page returns HTML',
      weekendUrl,
      weekendRes.ok,
      weekendRes.ok ? `HTTP ${weekendRes.status}` : `HTTP ${weekendRes.status}`
    ),
    check(
      'weekend_inventory_html',
      'Weekend page lists sale links',
      weekendUrl,
      /href=["']\/sales\//i.test(weekendRes.html),
      /href=["']\/sales\//i.test(weekendRes.html) ? 'Sale links in HTML' : 'Missing /sales/ links'
    )
  )

  const saleId = options?.sampleSaleId ?? process.env.SEO_CRAWL_SMOKE_SALE_ID?.trim()
  if (saleId) {
    const listingUrl = `${baseUrl}${getListingCanonicalPath(saleId)}`
    const listingRes = await fetchHtml(listingUrl)
    const crawlable = listingRes.html.includes('data-seo-sale-detail="crawlable"')
    checks.push(
      check(
        'listing_status',
        'Listing page returns HTML',
        listingUrl,
        listingRes.ok,
        listingRes.ok ? `HTTP ${listingRes.status}` : `HTTP ${listingRes.status}`
      ),
      check(
        'listing_crawl_block',
        'Listing SSR crawl block present',
        listingUrl,
        crawlable,
        crawlable ? 'data-seo-sale-detail=crawlable found' : 'SSR crawl block missing'
      )
    )
  } else {
    checks.push(
      check(
        'listing_skipped',
        'Listing crawl check (optional)',
        '(set SEO_CRAWL_SMOKE_SALE_ID)',
        true,
        'Skipped — provide sample published sale id'
      )
    )
  }

  const sitemapUrl = `${baseUrl}/sitemap/static.xml`
  const sitemapRes = await fetchHtml(sitemapUrl)
  const noQueryUrls = !sitemapRes.html.includes('?tab=') && !sitemapRes.html.includes('?')
  checks.push(
    check(
      'sitemap_static',
      'Static sitemap has no query URLs',
      sitemapUrl,
      sitemapRes.ok && noQueryUrls,
      sitemapRes.ok
        ? noQueryUrls
          ? 'No query-parameter URLs in static sitemap'
          : 'Query URLs detected in sitemap'
        : `HTTP ${sitemapRes.status}`
    )
  )

  const passed = checks.every((c) => c.pass)

  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed,
    checks,
  }
}
