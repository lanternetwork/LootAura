#!/usr/bin/env node
/**
 * Runs a specific shard of integration tests with explicit file-level sharding.
 * 
 * Inputs:
 *   SHARD_INDEX: 0-based shard index
 *   SHARD_COUNT: Total number of shards
 * 
 * Enforces hard cap: max 3 files per shard to prevent OOM.
 */

const { spawn } = require('child_process')
const { execSync } = require('child_process')
const path = require('path')

const shardIndex = parseInt(process.env.SHARD_INDEX || '0', 10)
const shardCount = parseInt(process.env.SHARD_COUNT || '1', 10)

if (isNaN(shardIndex) || isNaN(shardCount) || shardIndex < 0 || shardCount < 1) {
  console.error('Error: SHARD_INDEX and SHARD_COUNT must be valid non-negative integers')
  process.exit(1)
}

// Get list of test files
const listScript = path.resolve(__dirname, 'list-integration-tests.js')
const fileListOutput = execSync(`node ${listScript}`, { encoding: 'utf-8' })
const allFiles = fileListOutput
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)

// Assign files round-robin
const assignedFiles = []
for (let i = 0; i < allFiles.length; i++) {
  if (i % shardCount === shardIndex) {
    assignedFiles.push(allFiles[i])
  }
}

// Enforce hard cap: max 3 files
if (assignedFiles.length > 3) {
  console.error(`Error: Shard ${shardIndex}/${shardCount} assigned ${assignedFiles.length} files, exceeds hard cap of 3`)
  console.error('Assigned files:')
  assignedFiles.forEach(file => console.error(`  ${file}`))
  process.exit(1)
}

if (assignedFiles.length === 0) {
  console.log(`Shard ${shardIndex}/${shardCount}: No files assigned, skipping`)
  process.exit(0)
}

console.log(`Shard ${shardIndex}/${shardCount}: Running ${assignedFiles.length} file(s)`)
assignedFiles.forEach(file => console.log(`  ${file}`))

// Run vitest with assigned files
const vitestArgs = ['run', ...assignedFiles]

const vitestProcess = spawn('npx', ['vitest', ...vitestArgs], {
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





