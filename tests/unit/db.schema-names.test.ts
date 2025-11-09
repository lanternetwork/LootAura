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

  it('should use fully-qualified table names with getUserServerDb/getAdminDb clients', async () => {
    // NOTE: PostgREST only supports 'public' and 'graphql_public' schemas in client config.
    // To access lootaura_v2 tables, we must use fully-qualified names (e.g., .from('lootaura_v2.sales'))
    // with clients from getUserServerDb() or getAdminDb().
    // This test ensures writes use the helper functions with fully-qualified names.
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
          // Check for writes to lootaura_v2 tables without using helper functions
          // Pattern: .from('lootaura_v2.(sales|items|sale_drafts)').(insert|update|delete|upsert)(
          const writePattern = /\.from\(['"]lootaura_v2\.(sales|items|sale_drafts)['"]\)\s*\.(insert|update|delete|upsert)\(/
          
          if (writePattern.test(line)) {
            // Allow if it's a comment
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              return
            }
            
            // Check if this line is preceded by getUserServerDb() or getAdminDb() usage
            // Look back up to 10 lines for the helper function call
            const contextStart = Math.max(0, index - 10)
            const context = lines.slice(contextStart, index + 1).join('\n')
            
            // Allow if getUserServerDb or getAdminDb is used nearby
            if (context.includes('getUserServerDb') || context.includes('getAdminDb')) {
              return
            }
            
            // This is a violation - must use helper functions
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
        `Found ${violations.length} write operation(s) to lootaura_v2 tables without using getUserServerDb() or getAdminDb():\n${message}`
      )
    }
  })

  it('should not write to views (must use base tables)', async () => {
    // NOTE: Writes must go to base tables using schema-scoped clients.
    // Reads from views (public.sale_drafts, public.sales_v2, public.items_v2) are allowed for reads only.
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
          const writeToViewPattern = /\.from\(['"](public\.)?(sale_drafts|sales_v2|items_v2)['"]\)\s*\.(insert|update|delete|upsert)\(/
          
          if (writeToViewPattern.test(line)) {
            // Allow if it's a comment
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              return
            }
            // This is a violation - writes must use base tables via schema-scoped clients
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
        `Found ${violations.length} write operation(s) to views (must use base tables via schema-scoped clients):\n${message}`
      )
    }
  })
})

