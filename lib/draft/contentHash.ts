/**
 * Draft content hashing utilities
 * Creates stable, canonical hashes of draft payloads for deduplication
 * Excludes meta fields like currentStep that don't represent actual content changes
 */

import type { SaleDraftPayload } from '@/lib/validation/saleDraft'

/**
 * Canonicalize draft payload for hashing
 * Removes/ignores fields that don't represent meaningful content changes:
 * - currentStep: UI state, not content
 * - Item IDs: Can change without content change (temporary IDs)
 * 
 * Normalizes:
 * - Sorts arrays for consistent ordering
 * - Normalizes empty strings to undefined
 * - Sorts object keys for consistent JSON stringification
 */
function canonicalizeDraftPayload(payload: SaleDraftPayload): any {
  // Extract only meaningful content fields
  const canonical: any = {
    formData: {},
    photos: [],
    items: [],
  }

  // Copy formData (exclude currentStep if it exists)
  if (payload.formData) {
    const formData = payload.formData
    canonical.formData = {
      title: formData.title || undefined,
      description: formData.description || undefined,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      zip_code: formData.zip_code || undefined,
      lat: formData.lat ?? undefined,
      lng: formData.lng ?? undefined,
      date_start: formData.date_start || undefined,
      time_start: formData.time_start || undefined,
      date_end: formData.date_end || undefined,
      time_end: formData.time_end || undefined,
      duration_hours: formData.duration_hours ?? undefined,
      tags: formData.tags && formData.tags.length > 0 ? [...formData.tags].sort() : undefined,
      pricing_mode: formData.pricing_mode || undefined,
    }
    // Remove undefined values
    Object.keys(canonical.formData).forEach(key => {
      if (canonical.formData[key] === undefined) {
        delete canonical.formData[key]
      }
    })
  }

  // Copy photos (sorted for consistency)
  if (payload.photos && Array.isArray(payload.photos)) {
    canonical.photos = [...payload.photos].sort()
  }

  // Copy items (normalize: sort by name, exclude ID for comparison)
  if (payload.items && Array.isArray(payload.items)) {
    canonical.items = payload.items
      .map(item => ({
        name: item.name,
        price: item.price ?? undefined,
        description: item.description || undefined,
        image_url: item.image_url || undefined,
        category: item.category || undefined,
      }))
      .map(item => {
        // Remove undefined values
        const cleaned: any = {}
        Object.keys(item).forEach(key => {
          if (item[key as keyof typeof item] !== undefined) {
            cleaned[key] = item[key as keyof typeof item]
          }
        })
        return cleaned
      })
      .sort((a, b) => {
        // Sort by name for consistent ordering
        const nameA = a.name || ''
        const nameB = b.name || ''
        if (nameA !== nameB) return nameA.localeCompare(nameB)
        // Secondary sort by category
        const catA = a.category || ''
        const catB = b.category || ''
        return catA.localeCompare(catB)
      })
  }

  return canonical
}

/**
 * Create a stable hash of draft content (server-side)
 * Uses Node.js crypto for secure hashing
 */
export function hashDraftContent(payload: SaleDraftPayload): string {
  const canonical = canonicalizeDraftPayload(payload)
  
  // Create stable JSON string (sorted keys)
  const jsonStr = JSON.stringify(canonical, Object.keys(canonical).sort())
  
  // Use crypto for hashing (Node.js environment)
  if (typeof require !== 'undefined') {
    try {
      const crypto = require('crypto')
      return crypto.createHash('sha256').update(jsonStr).digest('hex').substring(0, 32)
    } catch {
      // Fallback if crypto not available
    }
  }
  
  // Fallback: simple hash (for client-side or if crypto unavailable)
  return simpleHash(jsonStr)
}

/**
 * Simple hash function for deterministic results (client-side fallback)
 * Uses djb2 algorithm for good distribution
 */
function simpleHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).padStart(8, '0')
}

/**
 * Check if two draft payloads have identical content
 */
export function draftsContentEqual(a: SaleDraftPayload, b: SaleDraftPayload): boolean {
  return hashDraftContent(a) === hashDraftContent(b)
}

