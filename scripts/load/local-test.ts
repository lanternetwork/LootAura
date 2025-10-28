#!/usr/bin/env tsx

import { spawn } from 'child_process'
import { join } from 'path'

interface LocalTestOptions {
  scenario?: string
  baseURL?: string
  ip?: string
  userToken?: string
}

function parseArgs(): LocalTestOptions {
  const args = process.argv.slice(2)
  const options: LocalTestOptions = {}
  
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
        printHelp()
        process.exit(0)
        break
    }
  }
  
  return options
}

function printHelp(): void {
  console.log(`
🚀 LootAura Local Load Test (Production Mode)

This script runs load tests against localhost with production-like rate limiting enabled.

Usage: tsx scripts/load/local-test.ts [options]

Options:
  --scenario <name>     Scenario to run (default: sales-baseline)
  --baseURL <url>       Base URL to test against (default: http://localhost:3000)
  --ip <address>        IP address to simulate (default: 192.168.1.100)
  --userToken <token>   Auth token for mutation tests
  --help, -h           Show this help message

Environment Variables Set:
  NODE_ENV=production
  RATE_LIMITING_ENABLED=true

Examples:
  tsx scripts/load/local-test.ts
  tsx scripts/load/local-test.ts --scenario sales-burst
  tsx scripts/load/local-test.ts --scenario mutation-sales --userToken "token"

Note: This temporarily sets NODE_ENV=production and RATE_LIMITING_ENABLED=true
for the test process only. No permanent environment changes are made.
`)
}

async function runLocalTest(options: LocalTestOptions): Promise<void> {
  const scenario = options.scenario || 'sales-baseline'
  const baseURL = options.baseURL || 'http://localhost:3000'
  
  console.log('🔧 Local Load Test (Production Mode)')
  console.log('=' .repeat(50))
  console.log(`Scenario: ${scenario}`)
  console.log(`Base URL: ${baseURL}`)
  console.log(`Environment: NODE_ENV=production, RATE_LIMITING_ENABLED=true`)
  console.log()
  
  // Build command arguments
  const args = [
    join(process.cwd(), 'scripts/load/cli.ts'),
    '--scenario', scenario,
    '--baseURL', baseURL
  ]
  
  if (options.ip) {
    args.push('--ip', options.ip)
  }
  
  if (options.userToken) {
    args.push('--userToken', options.userToken)
  }
  
  // Set production-like environment
  const env = {
    ...process.env,
    NODE_ENV: 'production' as const,
    RATE_LIMITING_ENABLED: 'true'
  }
  
  console.log('🚀 Starting load test with production settings...')
  console.log()
  
  return new Promise((resolve, reject) => {
    const child = spawn('tsx', args, {
      env,
      stdio: 'inherit',
      cwd: process.cwd()
    }) as ChildProcess
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log()
        console.log('✅ Local load test completed successfully!')
        resolve()
      } else {
        console.error(`❌ Load test failed with exit code ${code}`)
        reject(new Error(`Process exited with code ${code}`))
      }
    })
    
    child.on('error', (error) => {
      console.error('❌ Failed to start load test:', error)
      reject(error)
    })
  })
}

async function main(): Promise<void> {
  const options = parseArgs()
  
  try {
    await runLocalTest(options)
    process.exit(0)
  } catch (error) {
    console.error('❌ Local test failed:', error)
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
