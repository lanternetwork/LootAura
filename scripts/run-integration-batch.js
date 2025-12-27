#!/usr/bin/env node
/**
 * Runs a batch of integration test files sequentially.
 * 
 * Usage: node scripts/run-integration-batch.js [batchSize]
 * 
 * Enumerates tests/integration/ recursively for .test.ts and .test.tsx files
 * Sorts files
 * Runs N files sequentially (default: 2)
 * If ANY file fails → exit immediately
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const batchSize = parseInt(process.argv[2] || '2', 10)
const batchIndex = parseInt(process.env.BATCH_INDEX || '0', 10)
const totalBatches = parseInt(process.env.TOTAL_BATCHES || '1', 10)

if (isNaN(batchSize) || batchSize < 1) {
  console.error('Error: Batch size must be a positive integer')
  process.exit(1)
}

if (isNaN(batchIndex) || isNaN(totalBatches) || batchIndex < 0 || totalBatches < 1) {
  console.error('Error: BATCH_INDEX and TOTAL_BATCHES must be valid non-negative integers')
  process.exit(1)
}

const integrationTestDir = path.resolve(__dirname, '../tests/integration')

function findTestFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      findTestFiles(fullPath, fileList)
    } else if (entry.isFile() && /\.test\.(ts|tsx)$/.test(entry.name)) {
      fileList.push(path.resolve(fullPath))
    }
  }

  return fileList
}

// Enumerate and sort all test files
const allFiles = findTestFiles(integrationTestDir)
allFiles.sort()

// Calculate batch boundaries
const totalFiles = allFiles.length
const filesPerBatch = Math.ceil(totalFiles / totalBatches)
const startIndex = batchIndex * filesPerBatch
const endIndex = Math.min(startIndex + filesPerBatch, totalFiles)
const batchFiles = allFiles.slice(startIndex, endIndex)

if (batchFiles.length === 0) {
  console.log(`Batch ${batchIndex}/${totalBatches}: No files assigned, skipping`)
  process.exit(0)
}

console.log(`Batch ${batchIndex}/${totalBatches}: Running ${batchFiles.length} file(s)`)
batchFiles.forEach(file => console.log(`  ${file}`))

// Run files sequentially
const runScript = path.resolve(__dirname, 'run-single-integration-test.js')

for (const file of batchFiles) {
  console.log(`\n[Batch ${batchIndex}/${totalBatches}] Running: ${file}`)
  
  try {
    execSync(`node ${runScript} ${file}`, {
      stdio: 'inherit',
      env: {
        ...process.env,
      },
    })
  } catch (error) {
    console.error(`\n[Batch ${batchIndex}/${totalBatches}] Failed: ${file}`)
    process.exit(1)
  }
}

console.log(`\n[Batch ${batchIndex}/${totalBatches}] All files passed`)

