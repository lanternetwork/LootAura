/**
 * Local draft management utilities
 * Handles localStorage-based autosave for all users
 */

import { SaleDraftPayload } from '@/lib/validation/saleDraft'

const DRAFT_STORAGE_KEY = 'draft:sale:new'
const DRAFT_KEY_STORAGE_KEY = 'draft:sale:key'

/**
 * Generate a stable UUID for draft key (idempotency)
 */
export function generateDraftKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `draft-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
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

