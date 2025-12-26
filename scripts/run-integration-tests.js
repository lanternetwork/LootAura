#!/usr/bin/env node
/**
 * Hard process boundary wrapper for integration tests in CI
 * 
 * Spawns Vitest in a child process and terminates the process group when tests complete.
 * This ensures deterministic exit without relying on Node event loop cleanup.
 */

const { spawn } = require('child_process')

const vitest = spawn('npx', ['vitest', 'run', 'tests/integration/', '--exclude', 'tests/integration/admin/load-test-api.test.ts'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false,
  detached: true,
})

let lastOutputTime = Date.now()
let testSummarySeen = false
let exitCode = 1

// Forward stdout to parent's stdout while monitoring
vitest.stdout?.on('data', (data) => {
  lastOutputTime = Date.now()
  process.stdout.write(data)
  const output = data.toString()
  
  // Check for test summary indicators
  if (output.includes('Test Files') || output.includes('Tests') || output.includes('passed') || output.includes('failed')) {
    testSummarySeen = true
  }
})

// Forward stderr to parent's stderr while monitoring
vitest.stderr?.on('data', (data) => {
  lastOutputTime = Date.now()
  process.stderr.write(data)
  const output = data.toString()
  
  // Check for test summary indicators in stderr too
  if (output.includes('Test Files') || output.includes('Tests') || output.includes('passed') || output.includes('failed')) {
    testSummarySeen = true
  }
})

// Handle process exit
vitest.on('exit', (code) => {
  exitCode = code || 0
  clearInterval(checkInterval)
  
  // Kill the entire process group
  try {
    process.kill(-vitest.pid, 'SIGTERM')
  } catch (err) {
    // Process group may already be dead - ignore
  }
  
  // Exit with the child's exit code
  process.exit(exitCode)
})

// Monitor for completion: if no output for 2 seconds after seeing summary, exit
const checkInterval = setInterval(() => {
  const timeSinceLastOutput = Date.now() - lastOutputTime
  
  if (testSummarySeen && timeSinceLastOutput > 2000) {
    clearInterval(checkInterval)
    
    // Kill the entire process group
    try {
      if (!vitest.killed) {
        process.kill(-vitest.pid, 'SIGTERM')
      }
    } catch (err) {
      // Process group may already be dead - ignore
    }
    
    // Exit with the child's exit code
    process.exit(exitCode)
  }
}, 100)

// Handle errors
vitest.on('error', (err) => {
  clearInterval(checkInterval)
  console.error('Failed to spawn vitest:', err)
  process.exit(1)
})

// Ensure cleanup on parent process exit
process.on('SIGTERM', () => {
  clearInterval(checkInterval)
  try {
    if (!vitest.killed) {
      process.kill(-vitest.pid, 'SIGTERM')
    }
  } catch (err) {
    // Ignore
  }
  process.exit(exitCode)
})

process.on('SIGINT', () => {
  clearInterval(checkInterval)
  try {
    if (!vitest.killed) {
      process.kill(-vitest.pid, 'SIGTERM')
    }
  } catch (err) {
    // Ignore
  }
  process.exit(exitCode)
})

