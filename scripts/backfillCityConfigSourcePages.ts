#!/usr/bin/env tsx
/**
 * One-time backfill: set `ingestion_city_configs.source_pages` to [city page URL] when it is
 * still empty, using YSTM `source_url` values from `ingested_sales` for the same city/state.
 *
 * Usage:
 *   npx tsx scripts/backfillCityConfigSourcePages.ts
 *   npx tsx scripts/backfillCityConfigSourcePages.ts --dry-run
 *
 * Does not overwrite non-empty `source_pages` (re-checks before each update).
 * Skips rows where no matching ingested sale yields a derivable city page URL.
 */

import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { deriveYardsaleTreasureMapCityPageUrl } from '@/lib/ingestion/ensureCityConfigFromListingSource'

const EXTERNAL_PAGE_SOURCE = 'external_page_source'
const INGESTED_PAGE_SIZE = 1500
const CONFIG_PAGE_SIZE = 250

function normCity(city: string): string {
  return city.replace(/\s+/g, ' ').trim().toLowerCase()
}

function normState(state: string): string {
  return state.trim().toUpperCase()
}

function parseArgs(): { dryRun: boolean } {
  const dryRun = process.argv.includes('--dry-run')
  return { dryRun }
}

type AdminDb = ReturnType<typeof getAdminDb>

/** First matching ingested row wins (deterministic via ascending id walk). */
async function loadSourceUrlLookup(admin: AdminDb): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()
  let lastId = ''

  for (;;) {
    let q = fromBase(admin, 'ingested_sales')
      .select('id, source_url, city, state')
      .eq('source_platform', EXTERNAL_PAGE_SOURCE)
      .not('city', 'is', null)
      .not('source_url', 'is', null)
      .order('id', { ascending: true })
      .limit(INGESTED_PAGE_SIZE)

    if (lastId) {
      q = q.gt('id', lastId)
    }

    const { data, error } = await q
    if (error) {
      throw new Error(`ingested_sales scan failed: ${error.message}`)
    }
    const rows = data ?? []
    if (rows.length === 0) {
      break
    }

    for (const row of rows) {
      const city = row.city as string
      const state = row.state as string
      if (!city || !state) continue
      const key = `${normCity(city)}|${normState(state)}`
      if (!lookup.has(key)) {
        lookup.set(key, row.source_url as string)
      }
    }

    lastId = rows[rows.length - 1].id as string
    if (rows.length < INGESTED_PAGE_SIZE) {
      break
    }
  }

  return lookup
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs()
  const admin = getAdminDb()

  console.log(
    dryRun
      ? '[dry-run] Building ingested_sales lookup, no updates will be applied.'
      : 'Building ingested_sales lookup…'
  )

  const lookup = await loadSourceUrlLookup(admin)
  console.log(`Lookup keys (city|state): ${lookup.size}`)

  let updated = 0
  let skippedNoSample = 0
  let skippedDerive = 0
  let skippedAlreadyFilled = 0
  let lastConfigId = ''

  for (;;) {
    let q = fromBase(admin, 'ingestion_city_configs')
      .select('id, city, state, source_platform, source_pages')
      .eq('source_platform', EXTERNAL_PAGE_SOURCE)
      .eq('source_pages', [])
      .order('id', { ascending: true })
      .limit(CONFIG_PAGE_SIZE)

    if (lastConfigId) {
      q = q.gt('id', lastConfigId)
    }

    const { data: configs, error: cfgErr } = await q
    if (cfgErr) {
      throw new Error(`ingestion_city_configs page failed: ${cfgErr.message}`)
    }

    const batch = configs ?? []
    if (batch.length === 0) {
      break
    }

    for (const row of batch) {
      const id = row.id as string
      const city = String(row.city ?? '').replace(/\s+/g, ' ').trim()
      const state = String(row.state ?? '').trim()
      if (!city || !state) {
        skippedNoSample += 1
        continue
      }

      const sampleUrl = lookup.get(`${normCity(city)}|${normState(state)}`)
      if (!sampleUrl) {
        skippedNoSample += 1
        continue
      }

      const derived = deriveYardsaleTreasureMapCityPageUrl(sampleUrl)
      if (!derived) {
        skippedDerive += 1
        continue
      }

      if (dryRun) {
        console.log(`[dry-run] would set ${city}, ${state} -> ${derived}`)
        updated += 1
        continue
      }

      const { data: fresh, error: selErr } = await fromBase(admin, 'ingestion_city_configs')
        .select('source_pages')
        .eq('id', id)
        .maybeSingle()

      if (selErr) {
        console.warn(`Select failed for ${id}: ${selErr.message}`)
        continue
      }

      const pages = fresh?.source_pages as unknown
      if (Array.isArray(pages) && pages.length > 0) {
        skippedAlreadyFilled += 1
        continue
      }

      const { error: upErr, count } = await fromBase(admin, 'ingestion_city_configs')
        .update({ source_pages: [derived] }, { count: 'exact' })
        .eq('id', id)
        .eq('source_platform', EXTERNAL_PAGE_SOURCE)
        .eq('source_pages', [])

      if (upErr) {
        console.warn(`Update failed for ${id} (${city}, ${state}): ${upErr.message}`)
        continue
      }

      if (count === 0) {
        skippedAlreadyFilled += 1
        continue
      }

      updated += 1
    }

    lastConfigId = batch[batch.length - 1].id as string
    if (batch.length < CONFIG_PAGE_SIZE) {
      break
    }
  }

  console.log('Done.')
  console.log({
    updated,
    skippedNoSample,
    skippedDerive,
    skippedAlreadyFilled,
    dryRun,
  })
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
