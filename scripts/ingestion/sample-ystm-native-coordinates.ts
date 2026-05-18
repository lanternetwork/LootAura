/**
 * Pre-Phase-2A gate: sample YSTM detail pages and report native coordinate extract/validation rates.
 * Usage: npx tsx scripts/ingestion/sample-ystm-native-coordinates.ts [--limit 100]
 */
import { extractYstmNativeCoordinatesFromHtml } from '../../lib/ingestion/spatial/extractYstmNativeCoordinates'
import { validateNativeCoordinates } from '../../lib/ingestion/spatial/validateNativeCoordinates'

const DEFAULT_LIMIT = 100
const SEED_LIST_PAGES = [
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/',
  'https://yardsaletreasuremap.com/US/Texas/Houston/',
  'https://yardsaletreasuremap.com/US/Florida/Miami/',
  'https://yardsaletreasuremap.com/US/California/Los-Angeles/',
  'https://yardsaletreasuremap.com/US/Ohio/Columbus/',
]

const DETAIL_LINK =
  /https:\/\/yardsaletreasuremap\.com\/US\/[^"\s]+\/(?:userlisting|listing)\.html/gi

function parseLimit(argv: string[]): number {
  const idx = argv.indexOf('--limit')
  if (idx >= 0 && argv[idx + 1]) {
    const n = Number.parseInt(argv[idx + 1], 10)
    if (Number.isFinite(n) && n > 0) return Math.min(n, 200)
  }
  return DEFAULT_LIMIT
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; LootAura-Sample/1.0)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function collectDetailUrls(html: string): string[] {
  const urls = new Set<string>()
  for (const m of html.matchAll(DETAIL_LINK)) {
    urls.add(m[0].split('?')[0] ?? m[0])
  }
  return [...urls]
}

const PATH_STATE_TO_USPS: Record<string, string> = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  Florida: 'FL',
  Georgia: 'GA',
  Hawaii: 'HI',
  Idaho: 'ID',
  Illinois: 'IL',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Michigan: 'MI',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Montana: 'MT',
  Nebraska: 'NE',
  Nevada: 'NV',
  'New-Hampshire': 'NH',
  'New-Jersey': 'NJ',
  'New-Mexico': 'NM',
  'New-York': 'NY',
  'North-Carolina': 'NC',
  'North-Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode-Island': 'RI',
  'South-Carolina': 'SC',
  'South-Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West-Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
  'District-of-Columbia': 'DC',
}

function parseStateCityFromPath(path: string): { state: string; city: string } | null {
  const parts = path.split('/').filter(Boolean)
  if (parts[0] !== 'US' || !parts[1] || !parts[2]) return null
  const stateSeg = parts[1]
  const usps = PATH_STATE_TO_USPS[stateSeg]
  if (!usps) return null
  const city = parts[2].replace(/-/g, ' ')
  return { state: usps, city }
}

async function main(): Promise<void> {
  const limit = parseLimit(process.argv.slice(2))
  const detailUrls: string[] = []

  for (const listUrl of SEED_LIST_PAGES) {
    if (detailUrls.length >= limit * 2) break
    try {
      const html = await fetchText(listUrl)
      for (const url of collectDetailUrls(html)) {
        detailUrls.push(url)
        if (detailUrls.length >= limit * 2) break
      }
    } catch {
      // skip list page failures
    }
  }

  const sample = detailUrls.slice(0, limit)
  let fetched = 0
  let extracted = 0
  let validated = 0
  let fetchErrors = 0

  for (const url of sample) {
    try {
      const html = await fetchText(url)
      fetched += 1
      const coords = extractYstmNativeCoordinatesFromHtml(html)
      if (!coords) continue
      extracted += 1
      const pathMeta = parseStateCityFromPath(new URL(url).pathname)
      const validation = validateNativeCoordinates({
        lat: coords.lat,
        lng: coords.lng,
        state: pathMeta?.state ?? 'IL',
        city: pathMeta?.city ?? '',
        sourceUrl: url,
      })
      if (validation.ok) validated += 1
    } catch {
      fetchErrors += 1
    }
  }

  const report = {
    requested: limit,
    detailUrlsDiscovered: detailUrls.length,
    sampled: sample.length,
    fetched,
    fetchErrors,
    extracted,
    extractedRate: fetched > 0 ? extracted / fetched : 0,
    validated,
    validatedRate: fetched > 0 ? validated / fetched : 0,
    goNoGo: fetched >= 50 && extracted / Math.max(1, fetched) >= 0.9,
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
