import { describe, it, expect } from 'vitest'
import {
  sanitizePersistableDescription,
  sanitizeSaleDraftPayloadDescriptions,
  SALE_PERSISTABLE_DESCRIPTION_MAX_LENGTH,
  ITEM_PERSISTABLE_DESCRIPTION_MAX_LENGTH,
} from '@/lib/sanitizePersistableDescription'
import type { SaleDraftPayload } from '@/lib/validation/saleDraft'

describe('sanitizePersistableDescription', () => {
  it('returns null for null, undefined, and non-string input', () => {
    expect(sanitizePersistableDescription(null, 5000)).toBeNull()
    expect(sanitizePersistableDescription(undefined, 5000)).toBeNull()
    expect(sanitizePersistableDescription(42 as unknown as string, 5000)).toBeNull()
  })

  it('strips script tags before persistence', () => {
    expect(sanitizePersistableDescription('<script>alert(1)</script>Hello', 5000)).toBe('Hello')
    expect(sanitizePersistableDescription('<script>alert(1)</script>', 5000)).toBeNull()
  })

  it('strips event-handler attributes from markup', () => {
    const input = '<img src=x onerror="alert(1)">Visible text'
    expect(sanitizePersistableDescription(input, 5000)).toBe('Visible text')
  })

  it('preserves benign plain text', () => {
    const text = 'Vintage furniture, records, and camping gear. Cash only.'
    expect(sanitizePersistableDescription(text, 5000)).toBe(text)
  })

  it('enforces maxLength', () => {
    const long = 'a'.repeat(100)
    expect(sanitizePersistableDescription(long, 20)).toBe('a'.repeat(20))
  })

  it('uses schema-aligned max length constants', () => {
    expect(SALE_PERSISTABLE_DESCRIPTION_MAX_LENGTH).toBe(5000)
    expect(ITEM_PERSISTABLE_DESCRIPTION_MAX_LENGTH).toBe(2000)
  })
})

describe('sanitizeSaleDraftPayloadDescriptions', () => {
  const basePayload: SaleDraftPayload = {
    formData: {
      title: 'Test Sale',
      description: '<script>alert(1)</script>Safe sale text',
    },
    photos: [],
    items: [
      {
        id: 'item-1',
        name: 'Lamp',
        description: '<img src=x onerror="alert(1)">Nice lamp',
      },
    ],
    currentStep: 0,
    wantsPromotion: false,
  }

  it('sanitizes formData.description and item descriptions', () => {
    const sanitized = sanitizeSaleDraftPayloadDescriptions(basePayload)
    expect(sanitized.formData.description).toBe('Safe sale text')
    expect(sanitized.items[0]?.description).toBe('Nice lamp')
  })

  it('leaves items without string descriptions unchanged', () => {
    const payload: SaleDraftPayload = {
      ...basePayload,
      items: [{ id: 'item-2', name: 'Chair' }],
    }
    const sanitized = sanitizeSaleDraftPayloadDescriptions(payload)
    expect(sanitized.items[0]?.description).toBeUndefined()
  })
})
