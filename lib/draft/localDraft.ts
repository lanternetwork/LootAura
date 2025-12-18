/**
 * Local draft management utilities
 * Handles localStorage-based autosave for all users
 */

import { SaleDraftPayload } from '@/lib/validation/saleDraft'

const DRAFT_STORAGE_KEY = 'draft:sale:new'
const DRAFT_KEY_STORAGE_KEY = 'draft:sale:key'

/**
 * Generate a stable UUID for draft key (idempotency)
 * Always returns a valid UUID format (required by database schema)
 */
export function generateDraftKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // Fallback: Generate a valid UUID v4 format manually
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const hex = '0123456789abcdef'
  const randomHex = (length: number) => {
    let result = ''
    for (let i = 0; i < length; i++) {
      result += hex[Math.floor(Math.random() * 16)]
    }
    return result
  }
  
  // Generate UUID v4 format
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex(3)}-${randomHex(12)}`
}

/**
 * Get or create draft key from localStorage
 */
export function getDraftKey(): string {
  if (typeof window === 'undefined') return generateDraftKey()
  
  let draftKey = localStorage.getItem(DRAFT_KEY_STORAGE_KEY)
  if (!draftKey) {
    draftKey = generateDraftKey()
    localStorage.setItem(DRAFT_KEY_STORAGE_KEY, draftKey)
  }
  return draftKey
}

/**
 * Set draft key in localStorage (used when resuming a server draft)
 * This ensures all subsequent saves use the same draft_key as the resumed draft
 */
export function setDraftKey(draftKey: string): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(DRAFT_KEY_STORAGE_KEY, draftKey)
  } catch (error) {
    console.error('[LOCAL_DRAFT] Error setting draft key:', error)
  }
}

/**
 * Save draft to localStorage
 */
export function saveLocalDraft(payload: SaleDraftPayload): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
    // Ensure draft key exists
    getDraftKey()
  } catch (error) {
    console.error('[LOCAL_DRAFT] Error saving to localStorage:', error)
  }
}

/**
 * Load draft from localStorage
 */
export function loadLocalDraft(): SaleDraftPayload | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!stored) return null
    
    const parsed = JSON.parse(stored)
    // Basic validation - ensure it has the expected structure
    if (parsed && typeof parsed === 'object' && 'formData' in parsed) {
      return parsed as SaleDraftPayload
    }
    return null
  } catch (error) {
    console.error('[LOCAL_DRAFT] Error loading from localStorage:', error)
    return null
  }
}

/**
 * Clear local draft and draft key
 */
export function clearLocalDraft(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    localStorage.removeItem(DRAFT_KEY_STORAGE_KEY)
  } catch (error) {
    console.error('[LOCAL_DRAFT] Error clearing localStorage:', error)
  }
}

/**
 * Check if local draft exists
 */
export function hasLocalDraft(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(DRAFT_STORAGE_KEY) !== null
}

