#!/usr/bin/env tsx

import { readFileSync } from 'fs'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

interface CityConfigSeedRow {
  city: string
  state: string
  timezone: string
  enabled: boolean
  source_platform: string
}

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

const SOURCE_PLATFORM = 'external_page_source'
const DEFAULT_TIMEZONE = 'America/Chicago'
const BATCH_SIZE = 500

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

function buildRowsFromFile(filePath: string): CityConfigSeedRow[] {
  const raw = readFileSync(filePath, 'utf-8')
  const lines = raw.split(/\r?\n/)
  const byKey = new Map<string, CityConfigSeedRow>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('[')) continue // Skip markdown state index lines.
    if (/^state\s*,\s*city\s*,\s*source\s*url$/i.test(trimmed)) continue

    const cols = parseCsvLine(trimmed)
    if (cols.length < 3) continue

    const stateName = cols[0].replace(/\s+/g, ' ').trim()
    const city = normalizeCity(cols[1])
    const sourceUrl = cols.slice(2).join(',').trim()
    if (!stateName || !city || !sourceUrl) continue

    const stateCode = STATE_MAP[stateName]
    if (!stateCode) {
      console.warn(`Skipping row with unknown state: "${stateName}"`)
      continue
    }

    const row: CityConfigSeedRow = {
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

async function upsertRows(rows: CityConfigSeedRow[]): Promise<void> {
  const admin = getAdminDb()
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await fromBase(admin, 'ingestion_city_configs').upsert(batch, {
      onConflict: 'city,state,source_platform',
      ignoreDuplicates: false,
    })
    if (error) {
      throw new Error(`Failed upserting batch ${i / BATCH_SIZE + 1}: ${error.message}`)
    }
  }
}

async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('CSV path required.')
    console.error('Usage: npm run seed:cities -- "C:\\path\\to\\cities.csv"')
    process.exit(1)
  }

  const rows = buildRowsFromFile(csvPath)
  if (rows.length === 0) {
    console.log('No valid rows found. Nothing to insert.')
    process.exit(0)
  }

  await upsertRows(rows)
  console.log(`Seed complete. Upserted city configs: ${rows.length}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Seed failed: ${message}`)
  process.exit(1)
})

