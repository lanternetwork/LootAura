#!/usr/bin/env tsx

import { runLoadTest } from './harness'
import { scenarios, ScenarioOptions } from './scenarios'
import { generateLoadTestReport, writeLoadTestReport } from './report'
import { ensureOutputDir } from './util'

interface TestSuiteOptions {
  baseURL?: string
  ip?: string
  userToken?: string
  scenarios?: string[]
}

async function runTestSuite(options: TestSuiteOptions = {}): Promise<void> {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.100'
  const userToken = options.userToken
  
  const scenarioNames = options.scenarios || [
    'sales-baseline',
    'sales-burst', 
    'sales-sustained',
    'geo-cache-warmup',
    'geo-abuse',
    'auth-signin',
    'auth-magic-link',
    'mutation-sales',
    'multi-ip-sales'
  ]
  
  console.log('🚀 LootAura Load Test Suite')
  console.log('=' .repeat(50))
  console.log(`Base URL: ${baseURL}`)
  console.log(`IP Address: ${ip}`)
  console.log(`Scenarios: ${scenarioNames.join(', ')}`)
  console.log()
  
  const results = []
  
  for (const scenarioName of scenarioNames) {
    const scenario = scenarios[scenarioName as keyof typeof scenarios]
    if (!scenario) {
      console.error(`❌ Unknown scenario: ${scenarioName}`)
      continue
    }
    
    console.log(`🔄 Running scenario: ${scenarioName}`)
    
    const scenarioOptions: ScenarioOptions = {
      baseURL,
      ip,
      userToken
    }
    
    try {
      const config = scenario(scenarioOptions)
      const result = await runLoadTest(config)
      results.push(result)
      console.log(`✅ Completed: ${scenarioName}`)
    } catch (error) {
      console.error(`❌ Failed: ${scenarioName}`, error)
    }
    
    console.log()
  }
  
  if (results.length === 0) {
    console.error('❌ No scenarios completed successfully')
    process.exit(1)
  }
  
  console.log('📊 Generating comprehensive report...')
  
  const report = generateLoadTestReport(results, baseURL)
  const outputDir = ensureOutputDir()
  const reportPath = writeLoadTestReport(report, outputDir)
  
  console.log('✅ Load test suite completed!')
  console.log(`📁 Report saved to: ${reportPath}`)
  console.log()
  
  // Print summary
  console.log('📋 Executive Summary')
  console.log('=' .repeat(30))
  console.log(`Total Scenarios: ${results.length}`)
  console.log(`Total Requests: ${results.reduce((sum, r) => sum + r.metrics.totalRequests, 0)}`)
  console.log(`Average Success Rate: ${(results.reduce((sum, r) => sum + r.metrics.successRate, 0) / results.length).toFixed(1)}%`)
  console.log(`Total 429 Errors: ${results.reduce((sum, r) => sum + r.metrics.error429Count, 0)}`)
  console.log()
  
  // Print policy status
  console.log('🔒 Policy Status')
  console.log('=' .repeat(20))
  report.policies.forEach(policy => {
    const status = policy.status === 'PASS' ? '✅' : policy.status === 'FAIL' ? '❌' : '⚠️'
    console.log(`${status} ${policy.name}: ${policy.observed}`)
  })
  console.log()
  
  console.log('🎯 Key Findings')
  console.log('=' .repeat(20))
  report.findings.forEach(finding => {
    console.log(`• ${finding}`)
  })
  console.log()
  
  console.log('💡 Recommendations')
  console.log('=' .repeat(20))
  report.recommendations.forEach(rec => {
    console.log(`• ${rec}`)
  })
}

// CLI interface
function parseArgs(): TestSuiteOptions {
  const args = process.argv.slice(2)
  const options: TestSuiteOptions = {}
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    switch (arg) {
      case '--baseURL':
        options.baseURL = args[++i]
        break
      case '--ip':
        options.ip = args[++i]
        break
      case '--userToken':
        options.userToken = args[++i]
        break
      case '--scenarios':
        options.scenarios = args[++i].split(',')
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
🚀 LootAura Load Test Suite

Usage: tsx scripts/load/suite.ts [options]

Options:
  --baseURL <url>       Base URL to test against (default: http://localhost:3000)
  --ip <address>        IP address to simulate (default: 192.168.1.100)
  --userToken <token>   Auth token for mutation tests
  --scenarios <list>    Comma-separated list of scenarios to run
  --help, -h           Show this help message

Available Scenarios:
  sales-baseline       Baseline sales viewport test
  sales-burst          Burst test with soft-then-hard limits  
  sales-sustained      Sustained high rate test
  geo-cache-warmup     Geocoding cache warmup
  geo-abuse            Geocoding abuse test
  auth-signin          Auth signin rate limit test
  auth-magic-link      Auth magic link test
  mutation-sales       Sales creation mutation test
  multi-ip-sales       Multi-IP isolation test

Examples:
  tsx scripts/load/suite.ts
  tsx scripts/load/suite.ts --baseURL https://staging.lootaura.com
  tsx scripts/load/suite.ts --scenarios sales-baseline,sales-burst
  tsx scripts/load/suite.ts --userToken "your-jwt-token"

Output:
  Comprehensive report saved to /tmp/lootaura-load/LOAD-TEST-REPORT-*.md
  Individual scenario data saved as CSV and JSON files
`)
}

async function main(): Promise<void> {
  const options = parseArgs()
  
  try {
    await runTestSuite(options)
    process.exit(0)
  } catch (error) {
    console.error('❌ Test suite failed:', error)
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
