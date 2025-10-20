#!/usr/bin/env node

/**
 * Test script for cluster debugging functionality
 * Runs cluster-specific tests with debug logging enabled
 */

const { execSync } = require('child_process')
const path = require('path')

console.log('🧪 Running Cluster Debug Tests...\n')

// Set debug environment
process.env.NEXT_PUBLIC_DEBUG = 'true'

try {
  // Run cluster functionality tests
  console.log('📊 Running cluster functionality integration tests...')
  execSync('npm run test tests/integration/cluster-functionality.test.ts', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  })
  
  console.log('\n✅ Cluster debug tests completed successfully!')
  
  // Run with debug disabled to ensure flag works
  console.log('\n🔍 Testing debug flag behavior...')
  process.env.NEXT_PUBLIC_DEBUG = 'false'
  
  execSync('npm run test tests/integration/cluster-functionality.test.ts -- --reporter=verbose', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  })
  
  console.log('\n✅ Debug flag behavior verified!')
  
} catch (error) {
  console.error('\n❌ Cluster debug tests failed:', error.message)
  process.exit(1)
}
