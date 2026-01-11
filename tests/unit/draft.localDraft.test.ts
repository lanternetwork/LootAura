import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  generateDraftKey,
  getDraftKey,
  saveLocalDraft,
  loadLocalDraft,
  clearLocalDraft,
  hasLocalDraft
} from '@/lib/draft/localDraft'
import type { SaleDraftPayload } from '@/lib/validation/saleDraft'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

describe('localDraft utilities', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    localStorageMock.clear()
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  describe('generateDraftKey', () => {
    it('should generate a UUID-like string', () => {
      const key = generateDraftKey()
      expect(key).toBeTruthy()
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    })

    it('should generate unique keys', () => {
      const key1 = generateDraftKey()
      const key2 = generateDraftKey()
      expect(key1).not.toBe(key2)
    })
  })

  describe('getDraftKey', () => {
    it('should generate and store a draft key if none exists', () => {
      const key = getDraftKey()
      expect(key).toBeTruthy()
      expect(localStorageMock.getItem('draft:sale:key')).toBe(key)
    })

    it('should return existing draft key if present', () => {
      const existingKey = 'existing-key-123'
      localStorageMock.setItem('draft:sale:key', existingKey)
      const key = getDraftKey()
      expect(key).toBe(existingKey)
    })
  })

  describe('saveLocalDraft and loadLocalDraft', () => {
    it('should save and load a draft payload', () => {
      const payload: SaleDraftPayload = {
        formData: {
          title: 'Test Sale',
          city: 'Louisville',
          state: 'KY'
        },
        photos: ['https://example.com/image.jpg'],
        items: [
          {
            id: 'item-1',
            name: 'Test Item',
            price: 10
          }
        ],
        currentStep: 1,
        wantsPromotion: false
      }

      saveLocalDraft(payload)
      expect(hasLocalDraft()).toBe(true)

      const loaded = loadLocalDraft()
      expect(loaded).toEqual(payload)
    })

    it('should return null if no draft exists', () => {
      expect(loadLocalDraft()).toBeNull()
      expect(hasLocalDraft()).toBe(false)
    })
  })

  describe('clearLocalDraft', () => {
    it('should clear draft and draft key', () => {
      const payload: SaleDraftPayload = {
        formData: {},
        photos: [],
        items: [],
        currentStep: 0,
        wantsPromotion: false
      }

      saveLocalDraft(payload)
      getDraftKey() // Ensure key exists
      
      expect(hasLocalDraft()).toBe(true)
      expect(localStorageMock.getItem('draft:sale:key')).toBeTruthy()

      clearLocalDraft()
      
      expect(hasLocalDraft()).toBe(false)
      expect(localStorageMock.getItem('draft:sale:key')).toBeNull()
    })
  })
})

