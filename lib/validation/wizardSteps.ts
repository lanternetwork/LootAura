/**
 * Wizard step validators
 * 
 * Each step owns its validation logic.
 * Pure functions with no side effects, no server calls.
 */

import { containsUnsavory } from '@/lib/filters/profanity'

/**
 * Validation result type
 */
export type ValidationResult = {
  isValid: boolean
  errors: Record<string, string>
}

/**
 * Location step data type
 */
export type LocationStepData = {
  address?: string
  city?: string
  state?: string
  zip_code?: string
  lat?: number
  lng?: number
}

/**
 * Details step data type
 */
export type DetailsStepData = {
  title?: string
  description?: string
  date_start?: string
  time_start?: string
  date_end?: string
  time_end?: string
  pricing_mode?: 'negotiable' | 'firm' | 'best_offer' | 'ask'
  tags?: string[]
}

/**
 * Items step data type
 */
export type ItemsStepData = {
  items?: Array<{
    id: string
    name: string
    price?: number
    description?: string
    image_url?: string
    category?: string
  }>
}

/**
 * Validate location step
 * 
 * Validates:
 * - address (required, minimum 5 characters)
 * - city (required, minimum 2 characters)
 * - state (required, minimum 2 characters)
 * - zip_code (optional, but if provided must be valid format)
 * - lat (required, must be valid number)
 * - lng (required, must be valid number)
 * 
 * @param data - Location step data
 * @returns Validation result
 */
export function validateLocationStep(data: LocationStepData): ValidationResult {
  const errors: Record<string, string> = {}

  // Address validation
  if (!data.address || data.address.trim().length < 5) {
    errors.address = 'Address is required (minimum 5 characters)'
  } else {
    // Check for unsavory language in address
    const addressCheck = containsUnsavory(data.address)
    if (!addressCheck.ok) {
      errors.address = 'Please remove inappropriate language'
    }
  }

  // City validation
  if (!data.city || data.city.trim().length < 2) {
    errors.city = 'City is required'
  } else {
    // Check for unsavory language in city
    const cityCheck = containsUnsavory(data.city)
    if (!cityCheck.ok) {
      errors.city = 'Please remove inappropriate language'
    }
  }

  // State validation
  if (!data.state || data.state.trim().length < 2) {
    errors.state = 'State is required'
  } else {
    // Check for unsavory language in state
    const stateCheck = containsUnsavory(data.state)
    if (!stateCheck.ok) {
      errors.state = 'Please remove inappropriate language'
    }
  }

  // ZIP code validation (optional, but if provided must be valid)
  if (data.zip_code && data.zip_code.trim().length > 0) {
    if (!/^\d{5}(-\d{4})?$/.test(data.zip_code)) {
      errors.zip_code = 'ZIP code must be 5 digits or 5+4 format'
    }
  }

  // Latitude validation
  if (typeof data.lat !== 'number' || isNaN(data.lat)) {
    errors.lat = 'Please enter a complete address (street, city, state)'
  } else {
    // Validate latitude range
    if (data.lat < -90 || data.lat > 90) {
      errors.lat = 'Latitude must be between -90 and 90'
    }
  }

  // Longitude validation
  if (typeof data.lng !== 'number' || isNaN(data.lng)) {
    errors.lng = 'Please enter a complete address (street, city, state)'
  } else {
    // Validate longitude range
    if (data.lng < -180 || data.lng > 180) {
      errors.lng = 'Longitude must be between -180 and 180'
    }
  }

  // If lat or lng is missing, also set address error for clarity
  if ((typeof data.lat !== 'number' || isNaN(data.lat)) || (typeof data.lng !== 'number' || isNaN(data.lng))) {
    if (!errors.address) {
      errors.address = 'Please enter a complete address (street, city, state)'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate details step
 * 
 * Validates:
 * - title (required)
 * - description (optional, but if provided checked for unsavory language)
 * - date_start (required)
 * - time_start (required, must be in HH:MM format)
 * - date_end (required, must be >= date_start and <= date_start + 2 days)
 * - time_end (required, must be in HH:MM format)
 * - pricing_mode (optional, must be valid enum value)
 * - tags (optional, but if provided checked for unsavory language)
 * 
 * @param data - Details step data
 * @returns Validation result
 */
export function validateDetailsStep(data: DetailsStepData): ValidationResult {
  const errors: Record<string, string> = {}

  // Title validation
  if (!data.title || data.title.trim().length === 0) {
    errors.title = 'Title is required'
  } else {
    // Check for unsavory language in title
    const titleCheck = containsUnsavory(data.title)
    if (!titleCheck.ok) {
      errors.title = 'Please remove inappropriate language'
    }
  }

  // Description validation (optional, but if provided check for unsavory language)
  if (data.description && data.description.trim().length > 0) {
    const descriptionCheck = containsUnsavory(data.description)
    if (!descriptionCheck.ok) {
      errors.description = 'Please remove inappropriate language'
    }
  }

  // Date start validation
  if (!data.date_start || data.date_start.trim().length === 0) {
    errors.date_start = 'Start date is required'
  } else {
    // Validate date format (basic check - should be ISO date string or YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}/
    if (!dateRegex.test(data.date_start)) {
      errors.date_start = 'Start date must be in YYYY-MM-DD format'
    }
  }

  // Time start validation
  if (!data.time_start || data.time_start.trim().length === 0) {
    errors.time_start = 'Start time is required'
  } else {
    // Validate time format (HH:MM)
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(data.time_start)) {
      errors.time_start = 'Start time must be in HH:MM format'
    }
  }

  // Date end validation (required)
  if (!data.date_end || data.date_end.trim().length === 0) {
    errors.date_end = 'End date is required'
  } else {
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}/
    if (!dateRegex.test(data.date_end)) {
      errors.date_end = 'End date must be in YYYY-MM-DD format'
    } else if (data.date_start) {
      // Validate end date >= start date
      const startDate = new Date(data.date_start)
      const endDate = new Date(data.date_end)
      if (endDate < startDate) {
        errors.date_end = 'End date must be on or after start date'
      } else {
        // Validate end date <= start date + 2 days (3 day maximum)
        const maxEndDate = new Date(startDate)
        maxEndDate.setDate(maxEndDate.getDate() + 2)
        if (endDate > maxEndDate) {
          errors.date_end = 'Sales can last up to 3 days (maximum 2 days after start date)'
        }
      }
    }
  }

  // Time end validation (required)
  if (!data.time_end || data.time_end.trim().length === 0) {
    errors.time_end = 'End time is required'
  } else {
    // Validate time format (HH:MM)
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(data.time_end)) {
      errors.time_end = 'End time must be in HH:MM format'
    }
  }

  // Pricing mode validation (optional, but if provided must be valid)
  if (data.pricing_mode !== undefined && data.pricing_mode !== null) {
    const validPricingModes = ['negotiable', 'firm', 'best_offer', 'ask']
    if (!validPricingModes.includes(data.pricing_mode)) {
      errors.pricing_mode = 'Invalid pricing mode'
    }
  }

  // Tags validation (optional, but if provided check for unsavory language)
  if (data.tags && Array.isArray(data.tags)) {
    for (let i = 0; i < data.tags.length; i++) {
      const tag = data.tags[i]
      if (tag && typeof tag === 'string' && tag.trim().length > 0) {
        const tagCheck = containsUnsavory(tag)
        if (!tagCheck.ok) {
          errors[`tags[${i}]`] = 'Please remove inappropriate language'
        }
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate items step
 * 
 * Validates:
 * - items (optional, but if provided each item must have valid structure)
 * - Each item must have: id (required), name (required)
 * - Item name checked for unsavory language
 * - Item description (optional, but if provided checked for unsavory language)
 * - Item image_url (optional, but if provided must be valid URL)
 * 
 * @param data - Items step data
 * @returns Validation result
 */
export function validateItemsStep(data: ItemsStepData): ValidationResult {
  const errors: Record<string, string> = {}

  // Items are optional, but if provided must be valid
  if (data.items !== undefined && data.items !== null) {
    if (!Array.isArray(data.items)) {
      errors.items = 'Items must be an array'
    } else {
      // Validate each item
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i]
        
        if (!item || typeof item !== 'object') {
          errors[`items[${i}]`] = 'Item must be an object'
          continue
        }

        // Item ID validation
        if (!item.id || typeof item.id !== 'string' || item.id.trim().length === 0) {
          errors[`items[${i}].id`] = 'Item ID is required'
        }

        // Item name validation
        if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
          errors[`items[${i}].name`] = 'Item name is required'
        } else {
          // Check for unsavory language in item name
          const nameCheck = containsUnsavory(item.name)
          if (!nameCheck.ok) {
            errors[`items[${i}].name`] = 'Please remove inappropriate language'
          }
        }

        // Item description validation (optional, but if provided check for unsavory language)
        if (item.description && typeof item.description === 'string' && item.description.trim().length > 0) {
          const descriptionCheck = containsUnsavory(item.description)
          if (!descriptionCheck.ok) {
            errors[`items[${i}].description`] = 'Please remove inappropriate language'
          }
        }

        // Item image URL validation (optional, but if provided must be valid URL)
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

        // Item price validation (optional, but if provided must be non-negative number)
        if (item.price !== undefined && item.price !== null) {
          if (typeof item.price !== 'number' || isNaN(item.price)) {
            errors[`items[${i}].price`] = 'Item price must be a valid number'
          } else if (item.price < 0) {
            errors[`items[${i}].price`] = 'Item price cannot be negative'
          }
        }
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}
