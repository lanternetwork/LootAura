#!/usr/bin/env node
/**
 * Runs a single integration test file in its own Node process.
 * 
 * Usage: node scripts/run-single-integration-test.js <file>
 * 
 * Runs: vitest run <file> --pool=forks --maxWorkers=1
 * Inherits stdio and exits with Vitest's exit code.
 */

const { spawn } = require('child_process')
const path = require('path')

const testFile = process.argv[2]

if (!testFile) {
  console.error('Error: Test file path required')
  console.error('Usage: node scripts/run-single-integration-test.js <file>')
  process.exit(1)
}

// Resolve to absolute path
const absolutePath = path.isAbsolute(testFile) ? testFile : path.resolve(process.cwd(), testFile)

console.log(`Running: ${absolutePath}`)

// Run vitest with --pool=forks --maxWorkers=1 (no workers, single process)
// Increase heap size to 12GB to handle memory-intensive tests
const vitestProcess = spawn('npx', ['vitest', 'run', absolutePath, '--pool=forks', '--maxWorkers=1'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=12288',
  },
})

vitestProcess.on('exit', (code) => {
  process.exit(code || 0)
})

vitestProcess.on('error', (error) => {
  console.error('Error spawning vitest:', error)
  process.exit(1)
})

