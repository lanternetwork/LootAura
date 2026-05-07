import { describe, expect, it } from 'vitest'
import { sanitizeUploadDescription } from '@/app/api/admin/ingested-sales/upload/route'

describe('sanitizeUploadDescription', () => {
  it('removes ingestion noise tokens from polluted description', () => {
    const dirty = `
      Street View
      Directions
      Source: garagesalefinder.com
      9001 W 147th St, Orland Park, IL 60462
      8:30 am - 5:00 pm
      5/9 - 5/9
      Garage full of power tools and collectibles.
    `
    const cleaned = sanitizeUploadDescription(dirty)
    expect(cleaned).toBe('Garage full of power tools and collectibles.')
  })

  it('preserves legitimate descriptive text', () => {
    const cleaned = sanitizeUploadDescription('Vintage furniture, records, and camping gear. Cash only.')
    expect(cleaned).toBe('Vintage furniture, records, and camping gear. Cash only.')
  })

  it('returns null when all lines are noise', () => {
    const cleaned = sanitizeUploadDescription('Street View Directions Source: garagesalefinder.com 5/9 - 5/9')
    expect(cleaned).toBeNull()
  })
})

