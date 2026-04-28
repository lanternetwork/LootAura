#!/usr/bin/env tsx

import { readFileSync } from 'fs'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

interface ExpectedRow {
  city: string
  state: string
  source_platform: string
  enabled: boolean
  timezone: string
}

interface DbRow {
  city: string
  state: string
  source_platform: string
  enabled: boolean
  timezone: string
}

const SOURCE_PLATFORM = 'external_page_source'
const DEFAULT_TIMEZONE = 'America/Chicago'
const PAGE_SIZE = 1000

const STATE_MAP: Record<string, string> = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  'District of Columbia': 'DC',
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
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      cols.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

function normalizeCity(city: string): string {
  return city.replace(/\s+/g, ' ').trim()
}

function parseExpectedRows(csvPath: string): ExpectedRow[] {
  const raw = readFileSync(csvPath, 'utf-8')
  const lines = raw.split(/\r?\n/)
  const byKey = new Map<string, ExpectedRow>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('[')) continue
    if (/^state\s*,\s*city\s*,\s*source\s*url$/i.test(trimmed)) continue

    const cols = parseCsvLine(trimmed)
    if (cols.length < 3) continue

    const stateName = cols[0].replace(/\s+/g, ' ').trim()
    const city = normalizeCity(cols[1])
    const sourceUrl = cols.slice(2).join(',').trim()
    if (!stateName || !city || !sourceUrl) continue

    const stateCode = STATE_MAP[stateName]
    if (!stateCode) continue

    const row: ExpectedRow = {
      city,
      state: stateCode,
      source_platform: SOURCE_PLATFORM,
      enabled: true,
      timezone: DEFAULT_TIMEZONE,
    }
    byKey.set(`${row.city}|${row.state}|${row.source_platform}`, row)
  }

  return [...byKey.values()]
}

async function fetchDbRows(): Promise<DbRow[]> {
  const db = getAdminDb()
  const rows: DbRow[] = []
  let start = 0

  while (true) {
    const end = start + PAGE_SIZE - 1
    const { data, error } = await fromBase(db, 'ingestion_city_configs')
      .select('city,state,source_platform,enabled,timezone')
      .eq('source_platform', SOURCE_PLATFORM)
      .range(start, end)

    if (error) {
      throw new Error(`Failed fetching DB rows: ${error.message}`)
    }

    const page = (data ?? []) as DbRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    start += PAGE_SIZE
  }

  return rows
}

function buildKey(row: { city: string; state: string; source_platform: string }): string {
  return `${normalizeCity(row.city)}|${row.state.trim()}|${row.source_platform.trim()}`
}

async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('CSV path required.')
    console.error('Usage: npx tsx scripts/verifyCityConfigs.ts "scripts/data/YSTM City Links.txt"')
    process.exit(1)
  }

  const expectedRows = parseExpectedRows(csvPath)
  const dbRows = await fetchDbRows()

  const expectedByKey = new Map(expectedRows.map((r) => [buildKey(r), r]))
  const dbByKey = new Map(dbRows.map((r) => [buildKey(r), r]))

  const missingKeys: string[] = []
  const invalidFieldKeys: string[] = []

  for (const [key, expected] of expectedByKey.entries()) {
    const actual = dbByKey.get(key)
    if (!actual) {
      missingKeys.push(key)
      continue
    }
    if (actual.enabled !== expected.enabled || actual.timezone !== expected.timezone) {
      invalidFieldKeys.push(
        `${key} (enabled=${String(actual.enabled)} timezone=${actual.timezone})`
      )
    }
  }

  const unexpectedKeys: string[] = []
  for (const key of dbByKey.keys()) {
    if (!expectedByKey.has(key)) {
      unexpectedKeys.push(key)
    }
  }

  console.log(`Expected unique city configs from file: ${expectedRows.length}`)
  console.log(`Actual DB rows for source_platform=${SOURCE_PLATFORM}: ${dbRows.length}`)
  console.log(`Missing expected rows: ${missingKeys.length}`)
  console.log(`Rows with wrong enabled/timezone: ${invalidFieldKeys.length}`)
  console.log(`Unexpected extra DB rows for this source: ${unexpectedKeys.length}`)

  if (missingKeys.length > 0) {
    console.log('Sample missing rows:')
    missingKeys.slice(0, 20).forEach((k) => console.log(`  - ${k}`))
  }
  if (invalidFieldKeys.length > 0) {
    console.log('Sample rows with incorrect fields:')
    invalidFieldKeys.slice(0, 20).forEach((k) => console.log(`  - ${k}`))
  }
  if (unexpectedKeys.length > 0) {
    console.log('Sample unexpected rows:')
    unexpectedKeys.slice(0, 20).forEach((k) => console.log(`  - ${k}`))
  }

  if (missingKeys.length > 0 || invalidFieldKeys.length > 0) {
    throw new Error('City config verification failed')
  }

  console.log('Verification passed: all cities from file are present with expected fields.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Verification failed: ${message}`)
  process.exit(1)
})

