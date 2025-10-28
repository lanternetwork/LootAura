#!/usr/bin/env tsx

import { runLoadTest } from './harness'
import { scenarios, ScenarioName, ScenarioOptions } from './scenarios'
import { ensureOutputDir } from './util'

interface CLIOptions {
  scenario?: string
  baseURL?: string
  ip?: string
  userToken?: string
  help?: boolean
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const options: CLIOptions = {}
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    switch (arg) {
      case '--scenario':
        options.scenario = args[++i]
        break
      case '--baseURL':
        options.baseURL = args[++i]
        break
      case '--ip':
        options.ip = args[++i]
        break
      case '--userToken':
        options.userToken = args[++i]
        break
      case '--help':
      case '-h':
        options.help = true
        break
    }
  }
  
  return options
}

function printHelp(): void {
  console.log(`
🚀 LootAura Load Testing Harness

Usage: tsx scripts/load/harness.ts [options]

Options:
  --scenario <name>     Scenario to run (required)
  --baseURL <url>       Base URL to test against (default: http://localhost:3000)
  --ip <address>        IP address to simulate (default: random)
  --userToken <token>   Auth token for mutation tests
  --help, -h           Show this help message

Available Scenarios:
  sales-baseline       Baseline sales viewport test (5 concurrent, 10 RPS, 60s)
  sales-burst          Burst test with soft-then-hard limits (20 concurrent, 80 RPS, 45s)
  sales-sustained      Sustained high rate test (10 concurrent, 40 RPS, 120s)
  geo-cache-warmup     Geocoding cache warmup (2 concurrent, 5 RPS, 30s)
  geo-abuse            Geocoding abuse test (5 concurrent, 30 RPS, 30s)
  auth-signin          Auth signin rate limit test (5 concurrent, 20 RPS, 30s)
  auth-magic-link      Auth magic link test (5 concurrent, 20 RPS, 30s)
  mutation-sales       Sales creation mutation test (2 concurrent, 6 RPS, 60s)
  multi-ip-sales       Multi-IP isolation test (10 concurrent, 50 RPS, 60s)

Examples:
  tsx scripts/load/harness.ts --scenario sales-baseline
  tsx scripts/load/harness.ts --scenario sales-burst --baseURL https://staging.lootaura.com
  tsx scripts/load/harness.ts --scenario mutation-sales --userToken "your-jwt-token"

Output:
  Results are saved to /tmp/lootaura-load/ (or ./load-test-results/ as fallback)
  - CSV files with per-request metrics
  - JSON files with aggregated statistics
`)
}

async function main(): Promise<void> {
  const options = parseArgs()
  
  if (options.help || !options.scenario) {
    printHelp()
    process.exit(0)
  }
  
  const scenarioName = options.scenario as ScenarioName
  
  if (!scenarios[scenarioName]) {
    console.error(`❌ Unknown scenario: ${scenarioName}`)
    console.error(`Available scenarios: ${Object.keys(scenarios).join(', ')}`)
    process.exit(1)
  }
  
  const scenarioOptions: ScenarioOptions = {
    baseURL: options.baseURL,
    ip: options.ip,
    userToken: options.userToken
  }
  
  try {
    console.log('🔧 Environment Setup')
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`)
    console.log(`   RATE_LIMITING_ENABLED: ${process.env.RATE_LIMITING_ENABLED}`)
    console.log(`   Output Directory: ${ensureOutputDir()}`)
    console.log()
    
    const config = scenarios[scenarioName](scenarioOptions)
    const result = await runLoadTest(config)
    
    console.log('✅ Load test completed successfully!')
    console.log(`📁 Results saved to:`)
    console.log(`   CSV: ${result.csvPath}`)
    console.log(`   JSON: ${result.jsonPath}`)
    
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Load test failed:', error)
    process.exit(1)
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
