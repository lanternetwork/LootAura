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

  it('should not write to views (must use base tables lootaura_v2.*)', async () => {
    // NOTE: Writes must go to base tables (lootaura_v2.*) using admin client.
    // Reads from views (public.sale_drafts, public.sales_v2, public.items_v2) are allowed.
    // This test enforces that writes use base tables, not views.
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      ignore: [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/tests/**',
        '**/*.test.{ts,tsx,js,jsx}',
        '**/*.spec.{ts,tsx,js,jsx}',
        '**/mocks/**',
        '**/__mocks__/**',
      ],
      cwd: process.cwd(),
    })

    const violations: Array<{ file: string; line: number; content: string }> = []

    for (const file of files) {
      try {
        const content = readFileSync(join(process.cwd(), file), 'utf-8')
        const lines = content.split('\n')

        lines.forEach((line, index) => {
          // Check for writes to views: .from('(public.)?(sale_drafts|sales_v2|items_v2)').(insert|update|delete|upsert)(
          // Pattern: .from('(public\.)?(sale_drafts|sales_v2|items_v2)').(insert|update|delete|upsert)(
          const writeToViewPattern = /\.from\(['"](public\.)?(sale_drafts|sales_v2|items_v2)['"]\)\s*\.(insert|update|delete|upsert)\(/
          
          if (writeToViewPattern.test(line)) {
            // Allow if it's a comment
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              return
            }
            // This is a violation - writes must use base tables (lootaura_v2.*)
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
        `Found ${violations.length} write operation(s) to views (must use base tables lootaura_v2.*):\n${message}`
      )
    }
  })
})

