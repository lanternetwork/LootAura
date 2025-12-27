#!/usr/bin/env node
/**
 * Runs a single integration test file in its own Node process.
 * 
 * Usage: node scripts/run-single-integration-test.js <file>
 * 
 * Runs: vitest run <file> --runInBand
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

// Run vitest with --runInBand (no workers, single process)
const vitestProcess = spawn('npx', ['vitest', 'run', absolutePath, '--runInBand'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
  },
})

vitestProcess.on('exit', (code) => {
  process.exit(code || 0)
})

vitestProcess.on('error', (error) => {
  console.error('Error spawning vitest:', error)
  process.exit(1)
})

