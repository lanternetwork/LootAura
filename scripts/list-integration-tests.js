#!/usr/bin/env node
/**
 * Lists all integration test files recursively.
 * Outputs absolute file paths, one per line, sorted lexicographically.
 */

const fs = require('fs')
const path = require('path')

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

const testFiles = findTestFiles(integrationTestDir)
testFiles.sort()

for (const file of testFiles) {
  console.log(file)
}





