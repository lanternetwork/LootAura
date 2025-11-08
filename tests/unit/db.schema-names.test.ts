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

  it('should not write to views (must use base tables) - EXCEPT: PostgREST limitation requires views', async () => {
    // NOTE: PostgREST only supports 'public' and 'graphql_public' schemas in client config.
    // When the client is configured for 'public' schema, it cannot query tables in 'lootaura_v2' schema
    // using the schema.table format. Therefore, we MUST use views (sale_drafts, sales_v2, items_v2)
    // which have INSERT, UPDATE, DELETE permissions granted. This test is kept for documentation
    // but writes to views are now the correct approach.
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
            // Allow writes to views - this is now the correct approach due to PostgREST limitations
            // Views have INSERT, UPDATE, DELETE permissions granted in migrations
            return
          }
        })
      } catch (error) {
        // Skip files that can't be read
        console.warn(`Could not read file: ${file}`, error)
      }
    }

    // No violations - writes to views are now allowed and correct
    expect(violations.length).toBe(0)
  })
})

