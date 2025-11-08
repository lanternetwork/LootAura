/**
 * Static guard test to ensure no mock/stock items appear in production components
 * Scans for known mock item identifiers in component files
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { glob } from 'glob'

// Known mock/stock item identifiers that should NOT appear in production code
const MOCK_IDENTIFIERS = [
  'MOCK_ITEMS',
  'SAMPLE_ITEMS',
  'TEST_ITEM',
  'Vintage Coffee Table',
  'Dining Room Chairs (Set of 4)',
  'Bookshelf',
  'Kitchen Appliances',
  "Children's Toys",
  'Garden Tools',
  'Mock items',
  'mock items',
  'sampleItems',
  'testItems',
]

// Directories to scan (excluding test files)
const SCAN_DIRECTORIES = [
  'app/sales/**/*.{ts,tsx}',
  'components/sales/**/*.{ts,tsx}',
]

// Directories to exclude
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/tests/**',
  '**/*.test.{ts,tsx}',
  '**/*.spec.{ts,tsx}',
]

describe('Static Guard: No Mock Items in Production', () => {
  it('should not contain mock item identifiers in production components', async () => {
    const violations: Array<{ file: string; line: number; identifier: string }> = []

    // Scan all component files
    for (const pattern of SCAN_DIRECTORIES) {
      const files = await glob(pattern, {
        ignore: EXCLUDE_PATTERNS,
        cwd: process.cwd(),
      })

      for (const file of files) {
        try {
          const filePath = join(process.cwd(), file)
          const content = readFileSync(filePath, 'utf-8')
          const lines = content.split('\n')

          lines.forEach((line, index) => {
            MOCK_IDENTIFIERS.forEach((identifier) => {
              // Check if the identifier appears in the line (case-insensitive)
              if (line.toLowerCase().includes(identifier.toLowerCase())) {
                // Allow if it's in a comment that explicitly mentions it's being removed
                const isRemovalComment = /\/\/.*(remove|delete|fix|replace).*mock/i.test(line)
                // Allow if it's in a test file (though we exclude those)
                const isTestFile = file.includes('.test.') || file.includes('.spec.')
                
                if (!isRemovalComment && !isTestFile) {
                  violations.push({
                    file,
                    line: index + 1,
                    identifier,
                  })
                }
              }
            })
          })
        } catch (error) {
          // Skip files that can't be read (e.g., build artifacts)
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Could not read file ${file}:`, error)
          }
        }
      }
    }

    if (violations.length > 0) {
      const violationMessages = violations.map(
        (v) => `  ${v.file}:${v.line} - Found "${v.identifier}"`
      )
      expect.fail(
        `Found ${violations.length} mock item identifier(s) in production code:\n${violationMessages.join('\n')}`
      )
    }
  })
})

