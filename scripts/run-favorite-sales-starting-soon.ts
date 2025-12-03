/**
 * Script to run the "Favorite Sales Starting Soon" job
 * 
 * Usage:
 *   tsx scripts/run-favorite-sales-starting-soon.ts
 * 
 * This script processes favorites for sales starting within 24 hours
 * and sends reminder emails to users.
 */

import { processFavoriteSalesStartingSoonJob } from '../lib/jobs/processor'
import { logger } from '../lib/log'

async function main() {
  console.log('Starting Favorite Sales Starting Soon job...')
  console.log('')

  try {
    const result = await processFavoriteSalesStartingSoonJob({})

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
    logger.error('Favorite sales starting soon job script error', error instanceof Error ? error : new Error(errorMessage), {
      component: 'scripts/run-favorite-sales-starting-soon',
    })
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

