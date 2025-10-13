#!/usr/bin/env node

/**
 * Build-time CSS token checker
 * Ensures required Tailwind grid classes are present in compiled CSS
 */

const fs = require('fs')
const path = require('path')

// Required grid classes that must be present
const REQUIRED_GRID_CLASSES = [
  'grid-cols-1',
  'grid-cols-2', 
  'grid-cols-3',
  'grid-cols-4',
  'sm:grid-cols-1',
  'sm:grid-cols-2',
  'sm:grid-cols-3',
  'md:grid-cols-1',
  'md:grid-cols-2',
  'md:grid-cols-3',
  'lg:grid-cols-1',
  'lg:grid-cols-2',
  'lg:grid-cols-3',
  'lg:grid-cols-4',
  'xl:grid-cols-1',
  'xl:grid-cols-2',
  'xl:grid-cols-3',
  'xl:grid-cols-4'
]

// CSS file paths to check
const CSS_PATHS = [
  '.next/static/css/app/layout.css',
  '.next/static/css/app/page.css',
  'dist/app/layout.css',
  'dist/app/page.css'
]

function checkCSSTokens() {
  console.log('🔍 Checking for required CSS grid tokens...')
  
  let foundCSS = false
  const missingClasses = new Set(REQUIRED_GRID_CLASSES)
  
  for (const cssPath of CSS_PATHS) {
    if (fs.existsSync(cssPath)) {
      foundCSS = true
      console.log(`📁 Checking ${cssPath}`)
      
      try {
        const cssContent = fs.readFileSync(cssPath, 'utf8')
        
        for (const className of REQUIRED_GRID_CLASSES) {
          if (cssContent.includes(className)) {
            missingClasses.delete(className)
            console.log(`✅ Found: ${className}`)
          }
        }
      } catch (error) {
        console.warn(`⚠️  Error reading ${cssPath}:`, error.message)
      }
    }
  }
  
  if (!foundCSS) {
    console.warn('⚠️  No compiled CSS files found. Run build first.')
    return false
  }
  
  if (missingClasses.size === 0) {
    console.log('✅ All required grid classes found!')
    return true
  } else {
    console.error('❌ Missing required grid classes:')
    for (const className of missingClasses) {
      console.error(`   - ${className}`)
    }
    return false
  }
}

function checkParameterContract() {
  console.log('🔍 Checking parameter contract...')
  
  const sourceFiles = [
    'app/sales/SalesClient.tsx',
    'lib/hooks/useFilters.ts',
    'app/api/sales/route.ts',
    'app/api/sales/markers/route.ts'
  ]
  
  let violations = []
  
  for (const filePath of sourceFiles) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        
        // Check for cat= parameter emission
        if (content.includes('cat=') && !content.includes('// legacy')) {
          violations.push(`${filePath}: Contains 'cat=' parameter emission`)
        }
        
        // Check for proper categories parameter usage
        if (content.includes('categories=') || content.includes("'categories'")) {
          console.log(`✅ ${filePath}: Uses canonical 'categories' parameter`)
        }
      } catch (error) {
        console.warn(`⚠️  Error reading ${filePath}:`, error.message)
      }
    }
  }
  
  if (violations.length > 0) {
    console.error('❌ Parameter contract violations:')
    for (const violation of violations) {
      console.error(`   - ${violation}`)
    }
    return false
  }
  
  console.log('✅ Parameter contract satisfied!')
  return true
}

function main() {
  console.log('🚀 Running stabilization checks...\n')
  
  const cssCheck = checkCSSTokens()
  const paramCheck = checkParameterContract()
  
  console.log('\n📊 Results:')
  console.log(`   CSS Tokens: ${cssCheck ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`   Parameters: ${paramCheck ? '✅ PASS' : '❌ FAIL'}`)
  
  if (!cssCheck || !paramCheck) {
    console.log('\n❌ Stabilization checks failed!')
    process.exit(1)
  }
  
  console.log('\n✅ All stabilization checks passed!')
}

if (require.main === module) {
  main()
}

module.exports = { checkCSSTokens, checkParameterContract }
