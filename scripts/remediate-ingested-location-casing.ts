#!/usr/bin/env tsx
/**
 * One-time batch remediation: normalize ingested_sales.city / .state casing using
 * the same helpers as processIngestedSale. Does not touch address_raw or descriptions.
 *
 * Usage:
 *   npx tsx scripts/remediate-ingested-location-casing.ts --dry-run
 *   npx tsx scripts/remediate-ingested-location-casing.ts --execute --batch-size=200
 *
 * Requires service-role env (same as app): Supabase URL + service role key via existing client config.
 */

import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { normalizeIngestionCity, normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'

function parseArgs(argv: string[]): { dryRun: boolean; batchSize: number } {
  let dryRun = true
  let batchSize = 200

  for (const arg of argv) {
    if (arg === '--execute') {
      dryRun = false
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg.startsWith('--batch-size=')) {
      const n = Number.parseInt(arg.slice('--batch-size='.length), 10)
      if (Number.isFinite(n) && n > 0 && n <= 1000) {
        batchSize = n
      }
    }
  }

  return { dryRun, batchSize }
}

function locationChanged(
  prevCity: string | null,
  prevState: string | null,
  nextCity: string | null,
  nextState: string | null
): boolean {
  return prevCity !== nextCity || prevState !== nextState
}

async function main(): Promise<void> {
  const { dryRun, batchSize } = parseArgs(process.argv.slice(2))
  const admin = getAdminDb()

  let scanned = 0
  let wouldUpdate = 0
  let updated = 0
  let offset = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('id, city, state')
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) {
      console.error('remediate-ingested-location-casing: query failed', error.message)
      process.exit(1)
    }

    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break

    for (const row of rows as Array<{ id: string; city: string | null; state: string | null }>) {
      scanned += 1
      const nextCity = normalizeIngestionCity(row.city)
      const nextState = normalizeIngestionState(row.state)
      if (!locationChanged(row.city ?? null, row.state ?? null, nextCity, nextState)) {
        continue
      }
      wouldUpdate += 1
      if (dryRun) continue

      const { error: upErr } = await fromBase(admin, 'ingested_sales')
        .update({ city: nextCity, state: nextState })
        .eq('id', row.id)

      if (upErr) {
        console.error('remediate-ingested-location-casing: update failed', row.id, upErr.message)
        process.exit(1)
      }
      updated += 1
    }

    if (rows.length < batchSize) break
    offset += batchSize
  }

  console.log(
    JSON.stringify({
      dryRun,
      batchSize,
      scanned,
      wouldUpdate,
      updated: dryRun ? 0 : updated,
    })
  )
}

main().catch((e: unknown) => {
  console.error('remediate-ingested-location-casing failed', e instanceof Error ? e.message : e)
  process.exit(1)
})
