/**
 * Smoke tests for SEO metadata exports
 * 
 * Verifies that key routes export metadata or generateMetadata functions.
 * These are minimal checks to ensure SEO baseline is in place.
 */

import { describe, it, expect } from 'vitest'

describe('SEO Metadata Smoke Tests', () => {
  it('should export metadata from landing page', async () => {
    const page = await import('@/app/page')
    expect(page.metadata).toBeDefined()
    expect(typeof page.metadata).toBe('object')
  })

  it('should export metadata from sales page', async () => {
    const page = await import('@/app/sales/page')
    expect(page.metadata).toBeDefined()
    expect(typeof page.metadata).toBe('object')
  })

  it('should export metadata from dashboard page', async () => {
    const page = await import('@/app/(dashboard)/dashboard/page')
    expect(page.metadata).toBeDefined()
    expect(typeof page.metadata).toBe('object')
  })

  it('should export generateMetadata from sale detail page', async () => {
    const page = await import('@/app/sales/[id]/page')
    expect(page.generateMetadata).toBeDefined()
    expect(typeof page.generateMetadata).toBe('function')
  })
})

