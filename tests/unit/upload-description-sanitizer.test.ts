import { describe, expect, it } from 'vitest'
import { sanitizeUploadDescription } from '@/lib/ingestion/uploadDescriptionSanitizer'

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
    expect(cleaned).toContain('Garage full of power tools and collectibles.')
    expect(cleaned).toMatch(/8:30\s*am\s*[-–—]\s*5:00\s*pm/i)
    expect(cleaned).not.toMatch(/Street View|Directions|Source:|Orland Park|5\/9/i)
  })

  it('preserves legitimate descriptive text', () => {
    const cleaned = sanitizeUploadDescription('Vintage furniture, records, and camping gear. Cash only.')
    expect(cleaned).toBe('Vintage furniture, records, and camping gear. Cash only.')
  })

  it('returns null when all lines are noise', () => {
    const cleaned = sanitizeUploadDescription('Street View Directions Source: garagesalefinder.com 5/9 - 5/9')
    expect(cleaned).toBeNull()
  })

  it('strips inline address/date fragments while preserving prose and sale hours', () => {
    const dirty =
      'Lots of new bikes and toys for kids. 8:30 am - 5:00 pm 5/9 - 5/9 9001 W 147th St, Orland Park, IL 60462 Street View Directions Source: garagesalefinder.com'
    const cleaned = sanitizeUploadDescription(dirty)
    expect(cleaned).toContain('Lots of new bikes and toys for kids.')
    expect(cleaned).toMatch(/8:30\s*am\s*[-–—]\s*5:00\s*pm/i)
    expect(cleaned).not.toMatch(/Orland Park|5\/9|Street View|Source:/i)
  })

  it('preserves Oak Lawn sale-hour range with sign-up 8am noise', () => {
    const dirty = `
      front door at 8am each sale day
      Vintage furniture and housewares.
      9:00 am - 3:00 pm
      5/15 - 5/16
    `
    const cleaned = sanitizeUploadDescription(dirty)
    expect(cleaned).toMatch(/9:00\s*am\s*[-–—]\s*3:00\s*pm/i)
    expect(cleaned).toContain('front door at 8am each sale day')
    expect(cleaned).not.toMatch(/5\/15/i)
  })

  it('strips weekday-prefixed ranges and labeled single times', () => {
    const dirty = 'Vintage tools and records. Thu 5/7 - Sat 5/9 Start time: 8am Starts at 9:30am'
    const cleaned = sanitizeUploadDescription(dirty)
    expect(cleaned).toBe('Vintage tools and records.')
  })

  it('strips flattened CTA and zip/country pollution while preserving prose', () => {
    const dirty = 'Collectibles and bikes available. For more information please visit us at click here see listing 46307, USA'
    const cleaned = sanitizeUploadDescription(dirty)
    expect(cleaned).toBe('Collectibles and bikes available.')
  })
})

