/**
 * Unit tests to prevent schema-name regressions
 * Ensures no public.lootaura_v2.* usage in codebase
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { glob } from 'glob'

describe('Schema name validation', () => {
  it('should not contain public.lootaura_v2.* references', async () => {
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      ignore: [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/*.test.{ts,tsx,js,jsx}',
        '**/*.spec.{ts,tsx,js,jsx}',
      ],
      cwd: process.cwd(),
    })

    const violations: Array<{ file: string; line: number; content: string }> = []

    for (const file of files) {
      try {
        const content = readFileSync(join(process.cwd(), file), 'utf-8')
        const lines = content.split('\n')

        lines.forEach((line, index) => {
          // Check for public.lootaura_v2.* pattern
          if (/public\.lootaura_v2\.(sale_drafts|sales|items)/.test(line)) {
            violations.push({
              file,
              line: index + 1,
              content: line.trim(),
            })
          }
        })
      } catch (error) {
        // Skip files that can't be read
        console.warn(`Could not read file: ${file}`, error)
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line} - ${v.content}`)
        .join('\n')
      throw new Error(
        `Found ${violations.length} violation(s) of public.lootaura_v2.* pattern:\n${message}`
      )
    }
  })

  it('should not use schema-qualified table names in .from() calls', async () => {
    const apiFiles = await glob('app/api/**/*.{ts,tsx}', {
      ignore: ['**/node_modules/**', '**/.next/**'],
      cwd: process.cwd(),
    })

    const relevantFiles = apiFiles.filter(
      (file) =>
        file.includes('drafts') ||
        file.includes('sales') ||
        file.includes('items')
    )

    const violations: Array<{ file: string; line: number; content: string }> = []

    for (const file of relevantFiles) {
      try {
        const content = readFileSync(join(process.cwd(), file), 'utf-8')
        const lines = content.split('\n')

        lines.forEach((line, index) => {
          // Check for .from() calls with schema-qualified names (should use client schema instead)
          if (
            /\.from\(['"]lootaura_v2\.(sale_drafts|sales|items)['"]\)/.test(line) ||
            /\.from\(['"]public\.(sale_drafts|sales|items)['"]\)/.test(line)
          ) {
            // Allow if it's a comment or test file
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              return
            }
            violations.push({
              file,
              line: index + 1,
              content: line.trim(),
            })
          }
        })
      } catch (error) {
        console.warn(`Could not read file: ${file}`, error)
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line} - ${v.content}`)
        .join('\n')
      throw new Error(
        `Found ${violations.length} .from() call(s) with schema-qualified names (use client schema instead):\n${message}`
      )
    }
  })
})

