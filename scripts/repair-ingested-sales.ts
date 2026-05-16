#!/usr/bin/env tsx

import { runIngestedSalesRepair, verifyIngestedSalesRepair } from '@/lib/ingestion/ingestedSalesRepair'

function parseArgs(argv: string[]): { dryRun: boolean; limit: number } {
  let dryRun = false
  let limit = 500

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 2000)
      }
    }
  }

  return { dryRun, limit }
}

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs(process.argv.slice(2))
  const result = await runIngestedSalesRepair({ dryRun, limit })

  console.log(JSON.stringify({
    dryRun: result.dryRun,
    repairedDescriptions: result.repaired.ingestedDescription + result.repaired.salesDescription,
    repairedAddresses: result.repaired.salesAddress,
    skipped: result.skipped,
    scanned: result.scanned,
    writes: result.writes,
  }))

  const verification = await verifyIngestedSalesRepair()
  console.log(JSON.stringify({
    pollutedDescriptions: verification.pollutedDescriptions,
    duplicatedAddresses: verification.duplicatedAddresses,
  }))
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`repair-ingested-sales failed: ${message}`)
  process.exit(1)
})

