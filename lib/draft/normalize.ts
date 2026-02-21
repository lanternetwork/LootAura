/**
 * Shared normalization utilities for draft payloads
 * Used by both client and server to ensure consistent hashing
 */

import type { SaleDraftPayload } from '@/lib/validation/saleDraft'

/**
 * Normalize a draft payload for consistent comparison and hashing
 * - Trims whitespace from strings
 * - Sorts arrays for stable ordering (except photos, which preserve user-defined order)
 * - Normalizes empty strings to empty strings
 * - Excludes currentStep from normalization (step navigation should not trigger writes)
 */
export function normalizeDraftPayload(payload: SaleDraftPayload): Omit<SaleDraftPayload, 'currentStep'> {
  // Normalize formData strings (trim whitespace)
  const normalizedFormData = {
    ...payload.formData,
    title: payload.formData.title?.trim() || '',
    description: payload.formData.description?.trim() || '',
    address: payload.formData.address?.trim() || '',
    city: payload.formData.city?.trim() || '',
    state: payload.formData.state?.trim() || '',
    zip_code: payload.formData.zip_code?.trim() || '',
    date_start: payload.formData.date_start?.trim() || '',
    time_start: payload.formData.time_start?.trim() || '',
    date_end: payload.formData.date_end?.trim() || '',
    time_end: payload.formData.time_end?.trim() || '',
    // Tags: sort for stable ordering, trim each tag
    tags: (payload.formData.tags || [])
      .map(tag => tag?.trim())
      .filter(Boolean)
      .sort(), // Stable ordering
    pricing_mode: payload.formData.pricing_mode || 'negotiable',
  }

  // Photos: preserve user-defined order (do not sort)
  // Users can reorder photos, so order is meaningful and must be preserved
  const normalizedPhotos = [...(payload.photos || [])]
    .filter(Boolean)

  // Items: stable ordering (sort by id), normalize item fields
  const normalizedItems = [...(payload.items || [])]
    .map(item => ({
      id: item.id || '',
      name: (item.name || '').trim(),
      price: item.price,
      description: (item.description || '').trim(),
      image_url: (item.image_url || '').trim(),
      category: item.category,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)) // Stable ordering by id

  return {
    formData: normalizedFormData,
    photos: normalizedPhotos,
    items: normalizedItems,
    // Note: currentStep is excluded from normalization/hashing
    // Step navigation (Next/Previous/resume) should not trigger draft writes
    // Only content changes should trigger writes
    wantsPromotion: payload.wantsPromotion || false,
  }
}
