/**
 * Script to run the "Seller Weekly Analytics" job
 * 
 * Usage:
 *   tsx scripts/run-seller-weekly-analytics.ts [date]
 * 
 * This script sends weekly analytics emails to sellers for the last full week.
 * Optionally accepts a date parameter (ISO format, e.g., "2025-01-06") to compute
 * the week for a specific date instead of today.
 * 
 * Examples:
 *   tsx scripts/run-seller-weekly-analytics.ts
 *   tsx scripts/run-seller-weekly-analytics.ts 2025-01-06
 */

import { processSellerWeeklyAnalyticsJob } from '../lib/jobs/processor'
import { logger } from '../lib/log'

async function main() {
  const dateArg = process.argv[2]
  
  console.log('Starting Seller Weekly Analytics job...')
  if (dateArg) {
    console.log(`Using reference date: ${dateArg}`)
  }
  console.log('')

  try {
    const result = await processSellerWeeklyAnalyticsJob({
      date: dateArg,
    })

    if (result.success) {
      console.log('✅ Job completed successfully')
      process.exit(0)
    } else {
      console.error('❌ Job failed:', result.error)
      process.exit(1)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Job error:', errorMessage)
    logger.error('Seller weekly analytics job script error', error instanceof Error ? error : new Error(errorMessage), {
      component: 'scripts/run-seller-weekly-analytics',
    })
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

