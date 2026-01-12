/**
 * Compute publishability for a draft
 * 
 * Pure function that determines if a draft is ready to be published.
 * No side effects, no database calls, no exceptions thrown.
 * 
 * @param draft - Draft record with payload field
 * @returns Publishability result with isPublishable flag and blocking errors
 */

import { SaleDraftPayload } from '@/lib/validation/saleDraft'

/**
 * Draft record structure (as stored in database)
 */
export type DraftRecord = {
  id?: string
  draft_key?: string
  user_id?: string
  title?: string | null
  payload: SaleDraftPayload
  status?: string
  updated_at?: string
  expires_at?: string
}

/**
 * Publishability result
 */
export type PublishabilityResult = {
  isPublishable: boolean
  blockingErrors: Record<string, string>
}

/**
 * Compute publishability for a draft
 * 
 * Rules:
 * - category is required (from tags or explicit category field)
 * - address, city, state, lat, lng are required
 * - date_start and time_start are required
 * - photos are optional
 * - items are optional
 * 
 * @param draft - Draft record with payload
 * @returns Publishability result
 */
export function computePublishability(draft: DraftRecord): PublishabilityResult {
  const errors: Record<string, string> = {}
  
  // Guard: draft must have payload
  if (!draft || !draft.payload) {
    return {
      isPublishable: false,
      blockingErrors: {
        draft: 'Draft payload is missing'
      }
    }
  }
  
  const { formData, photos, items } = draft.payload
  
  // Guard: formData must exist
  if (!formData) {
    return {
      isPublishable: false,
      blockingErrors: {
        formData: 'Form data is missing'
      }
    }
  }
  
  // Required: title (required by publish route)
  if (!formData.title || typeof formData.title !== 'string' || formData.title.trim().length === 0) {
    errors.title = 'Title is required'
  }
  
  // Required: category (check tags array for category values)
  // Category is typically stored in tags array
  const hasCategory = formData.tags && Array.isArray(formData.tags) && formData.tags.length > 0
  if (!hasCategory) {
    errors.category = 'Category is required'
  }
  
  // Required: address
  if (!formData.address || typeof formData.address !== 'string' || formData.address.trim().length === 0) {
    errors.address = 'Address is required'
  }
  
  // Required: city
  if (!formData.city || typeof formData.city !== 'string' || formData.city.trim().length === 0) {
    errors.city = 'City is required'
  }
  
  // Required: state
  if (!formData.state || typeof formData.state !== 'string' || formData.state.trim().length === 0) {
    errors.state = 'State is required'
  }
  
  // Required: latitude
  if (typeof formData.lat !== 'number' || isNaN(formData.lat)) {
    errors.lat = 'Latitude is required and must be a valid number'
  } else {
    // Validate latitude range
    if (formData.lat < -90 || formData.lat > 90) {
      errors.lat = 'Latitude must be between -90 and 90'
    }
  }
  
  // Required: longitude
  if (typeof formData.lng !== 'number' || isNaN(formData.lng)) {
    errors.lng = 'Longitude is required and must be a valid number'
  } else {
    // Validate longitude range
    if (formData.lng < -180 || formData.lng > 180) {
      errors.lng = 'Longitude must be between -180 and 180'
    }
  }
  
  // Required: date_start
  if (!formData.date_start || typeof formData.date_start !== 'string' || formData.date_start.trim().length === 0) {
    errors.date_start = 'Start date is required'
  } else {
    // Validate date format (basic check - should be ISO date string or YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}/
    if (!dateRegex.test(formData.date_start)) {
      errors.date_start = 'Start date must be in YYYY-MM-DD format'
    }
  }
  
  // Required: time_start
  if (!formData.time_start || typeof formData.time_start !== 'string' || formData.time_start.trim().length === 0) {
    errors.time_start = 'Start time is required'
  } else {
    // Validate time format (HH:MM)
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(formData.time_start)) {
      errors.time_start = 'Start time must be in HH:MM format'
    }
  }
  
  // Optional: date_end (if provided, must be valid)
  if (formData.date_end !== undefined && formData.date_end !== null && formData.date_end !== '') {
    if (typeof formData.date_end !== 'string') {
      errors.date_end = 'End date must be a string'
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}/
      if (!dateRegex.test(formData.date_end)) {
        errors.date_end = 'End date must be in YYYY-MM-DD format'
      }
    }
  }
  
  // Optional: time_end (if provided, must be valid)
  if (formData.time_end !== undefined && formData.time_end !== null && formData.time_end !== '') {
    if (typeof formData.time_end !== 'string') {
      errors.time_end = 'End time must be a string'
    } else {
      const timeRegex = /^\d{2}:\d{2}$/
      if (!timeRegex.test(formData.time_end)) {
        errors.time_end = 'End time must be in HH:MM format'
      }
    }
  }
  
  // Optional: photos (if provided, must be valid URLs)
  if (photos !== undefined && photos !== null) {
    if (!Array.isArray(photos)) {
      errors.photos = 'Photos must be an array'
    } else {
      // Validate each photo URL if provided
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        if (typeof photo !== 'string' || photo.trim().length === 0) {
          errors[`photos[${i}]`] = 'Photo URL must be a non-empty string'
        } else {
          // Basic URL validation
          try {
            new URL(photo)
          } catch {
            errors[`photos[${i}]`] = 'Photo URL must be a valid URL'
          }
        }
      }
    }
  }
  
  // Optional: items (if provided, must have valid structure)
  if (items !== undefined && items !== null) {
    if (!Array.isArray(items)) {
      errors.items = 'Items must be an array'
    } else {
      // Validate each item if provided
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!item || typeof item !== 'object') {
          errors[`items[${i}]`] = 'Item must be an object'
        } else {
          // Required item fields
          if (!item.id || typeof item.id !== 'string' || item.id.trim().length === 0) {
            errors[`items[${i}].id`] = 'Item ID is required'
          }
          if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
            errors[`items[${i}].name`] = 'Item name is required'
          }
          // Optional item fields validated if present
          if (item.image_url !== undefined && item.image_url !== null && item.image_url !== '') {
            if (typeof item.image_url !== 'string') {
              errors[`items[${i}].image_url`] = 'Item image URL must be a string'
            } else {
              try {
                new URL(item.image_url)
              } catch {
                errors[`items[${i}].image_url`] = 'Item image URL must be a valid URL'
              }
            }
          }
        }
      }
    }
  }
  
  return {
    isPublishable: Object.keys(errors).length === 0,
    blockingErrors: errors
  }
}
