import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Bbox validation schema (copied from API route)
const bboxSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180)
}).refine((data) => data.north > data.south, {
  message: "north must be greater than south",
  path: ["north"]
}).refine((data) => data.east > data.west, {
  message: "east must be greater than west", 
  path: ["east"]
})

describe('Bbox Validator', () => {
  it('should validate correct bbox', () => {
    const validBbox = {
      north: 40.0,
      south: 39.0,
      east: -85.0,
      west: -86.0
    }
    
    const result = bboxSchema.safeParse(validBbox)
    expect(result.success).toBe(true)
  })

  it('should reject when north <= south', () => {
    const invalidBbox = {
      north: 39.0,
      south: 40.0,
      east: -85.0,
      west: -86.0
    }
    
    const result = bboxSchema.safeParse(invalidBbox)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('north must be greater than south')
    }
  })

  it('should reject when east <= west', () => {
    const invalidBbox = {
      north: 40.0,
      south: 39.0,
      east: -86.0,
      west: -85.0
    }
    
    const result = bboxSchema.safeParse(invalidBbox)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('east must be greater than west')
    }
  })

  it('should reject out of range coordinates', () => {
    const invalidBbox = {
      north: 91.0,
      south: 39.0,
      east: -85.0,
      west: -86.0
    }
    
    const result = bboxSchema.safeParse(invalidBbox)
    expect(result.success).toBe(false)
  })

  it('should reject invalid longitude range', () => {
    const invalidBbox = {
      north: 40.0,
      south: 39.0,
      east: 181.0,
      west: -86.0
    }
    
    const result = bboxSchema.safeParse(invalidBbox)
    expect(result.success).toBe(false)
  })
})
