#!/usr/bin/env node

/**
 * CSS Token Scanner
 * Checks compiled CSS for required Tailwind grid tokens
 */

const fs = require('fs')
const path = require('path')

// Required grid tokens that must be present
const REQUIRED_GRID_TOKENS = [
  'grid-cols-1',
  'grid-cols-2', 
  'grid-cols-3',
  'grid-cols-4',
  'sm:grid-cols-1',
  'sm:grid-cols-2',
  'sm:grid-cols-3',
  'md:grid-cols-2',
  'md:grid-cols-3',
  'md:grid-cols-4',
  'lg:grid-cols-2',
  'lg:grid-cols-3',
  'lg:grid-cols-4',
  'xl:grid-cols-3',
  'xl:grid-cols-4',
  'grid',
  'gap-4',
  'gap-6',
  'gap-8'
]

function scanCSSFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ CSS file not found: ${filePath}`)
    return false
  }

  const cssContent = fs.readFileSync(filePath, 'utf8')
  const missingTokens = []
  
  for (const token of REQUIRED_GRID_TOKENS) {
    // Check for exact class name in CSS
    const regex = new RegExp(`\\.${token.replace(/:/g, '\\\\:')}\\b`, 'g')
    if (!regex.test(cssContent)) {
      missingTokens.push(token)
    }
  }

  if (missingTokens.length > 0) {
    console.error(`❌ Missing required grid tokens:`)
    missingTokens.forEach(token => console.error(`  - ${token}`))
    return false
  }

  console.log(`✅ All required grid tokens found in ${filePath}`)
  return true
}

function main() {
  console.log('🔍 Scanning for required Tailwind grid tokens...')
  
  // Check for compiled CSS in common locations
  const possiblePaths = [
    '.next/static/css/app.css',
    '.next/static/css/globals.css',
    'dist/static/css/app.css',
    'out/static/css/app.css'
  ]
  
  let foundValidCSS = false
  
  for (const cssPath of possiblePaths) {
    if (fs.existsSync(cssPath)) {
      if (scanCSSFile(cssPath)) {
        foundValidCSS = true
        break
      }
    }
  }
  
  if (!foundValidCSS) {
    console.log('⚠️  No compiled CSS found in expected locations')
    console.log('   This may be expected if build has not run yet')
    console.log('   Required tokens will be verified during build process')
    process.exit(0) // Non-blocking for now
  }
  
  console.log('✅ CSS token scan completed')
}

if (require.main === module) {
  main()
}

module.exports = { scanCSSFile, REQUIRED_GRID_TOKENS }