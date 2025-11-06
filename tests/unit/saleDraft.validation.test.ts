import { describe, it, expect } from 'vitest'
import { SaleDraftPayloadSchema, SaleDraftItemSchema } from '@/lib/validation/saleDraft'

describe('SaleDraftPayloadSchema', () => {
  it('should validate a minimal draft payload', () => {
    const minimal = {
      formData: {},
      photos: [],
      items: [],
      currentStep: 0
    }
    
    const result = SaleDraftPayloadSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('should validate a complete draft payload', () => {
    const complete = {
      formData: {
        title: 'Test Sale',
        description: 'A test sale',
        address: '123 Main St',
        city: 'Louisville',
        state: 'KY',
        zip_code: '40202',
        lat: 38.25,
        lng: -85.75,
        date_start: '2024-12-01',
        time_start: '09:00',
        date_end: '2024-12-01',
        time_end: '13:00',
        duration_hours: 4,
        tags: ['furniture', 'electronics'],
        pricing_mode: 'negotiable' as const
      },
      photos: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      items: [
        {
          id: 'item-1',
          name: 'Test Item',
          price: 10.50,
          description: 'A test item',
          image_url: 'https://example.com/item.jpg',
          category: 'furniture' as const
        }
      ],
      currentStep: 2
    }
    
    const result = SaleDraftPayloadSchema.safeParse(complete)
    expect(result.success).toBe(true)
  })

  it('should reject invalid photo URLs', () => {
    const invalid = {
      formData: {},
      photos: ['not-a-url'],
      items: [],
      currentStep: 0
    }
    
    const result = SaleDraftPayloadSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('should reject invalid currentStep', () => {
    const invalid = {
      formData: {},
      photos: [],
      items: [],
      currentStep: 5 // Out of range (0-3)
    }
    
    const result = SaleDraftPayloadSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe('SaleDraftItemSchema', () => {
  it('should validate a minimal item', () => {
    const minimal = {
      id: 'item-1',
      name: 'Test Item'
    }
    
    const result = SaleDraftItemSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('should validate a complete item', () => {
    const complete = {
      id: 'item-1',
      name: 'Test Item',
      price: 10.50,
      description: 'A test item',
      image_url: 'https://example.com/item.jpg',
      category: 'furniture' as const
    }
    
    const result = SaleDraftItemSchema.safeParse(complete)
    expect(result.success).toBe(true)
  })

  it('should reject negative prices', () => {
    const invalid = {
      id: 'item-1',
      name: 'Test Item',
      price: -10
    }
    
    const result = SaleDraftItemSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

