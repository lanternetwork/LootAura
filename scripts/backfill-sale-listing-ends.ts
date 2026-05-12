#!/usr/bin/env tsx

import { runBackfillSaleListingEnds } from '@/lib/sales/backfillSaleListingEndsAt'

function parseArgs(argv: string[]): {
  dryRun: boolean
  batchSize: number
  maxRows: number
  resumeAfterId: string | null
} {
  let explicitDry = false
  let explicitExecute = false
  let batchSize = 75
  let maxRows = 50_000
  let resumeAfterId: string | null = null

  for (const arg of argv) {
    if (arg === '--dry-run') {
      explicitDry = true
      continue
    }
    if (arg === '--execute') {
      explicitExecute = true
      continue
    }
    if (arg.startsWith('--batch-size=')) {
      const parsed = Number.parseInt(arg.slice('--batch-size='.length), 10)
      if (Number.isFinite(parsed) && parsed > 0) batchSize = Math.min(parsed, 500)
      continue
    }
    if (arg.startsWith('--max-rows=')) {
      const parsed = Number.parseInt(arg.slice('--max-rows='.length), 10)
      if (Number.isFinite(parsed) && parsed > 0) maxRows = parsed
      continue
    }
    if (arg.startsWith('--resume-after-id=')) {
      resumeAfterId = arg.slice('--resume-after-id='.length).trim() || null
      continue
    }
  }

  if (explicitExecute && explicitDry) {
    console.error('Pass only one of --dry-run or --execute')
    process.exit(2)
  }

  const dryRun = !explicitExecute

  return { dryRun, batchSize, maxRows, resumeAfterId }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.dryRun && process.env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY (required for --execute)')
    process.exit(1)
  }

  const result = await runBackfillSaleListingEnds({
    dryRun: opts.dryRun,
    batchSize: opts.batchSize,
    maxRows: opts.maxRows,
    resumeAfterId: opts.resumeAfterId,
    logOperation: 'cli_backfill_sale_listing_ends',
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`backfill-sale-listing-ends failed: ${message}`)
  process.exit(1)
})
