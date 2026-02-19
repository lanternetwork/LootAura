import { z } from 'zod'
import { zCategory } from '@/lib/zodSchemas'

// Draft status enum
export const DraftStatusSchema = z.enum(['active', 'published', 'archived'])
export type DraftStatus = z.infer<typeof DraftStatusSchema>

// Sale draft item schema (matches wizard item structure)
// Note: id can be UUID or fallback format (item-timestamp-random)
// Enterprise-ready: Includes size limits to prevent abuse
export const SaleDraftItemSchema = z.object({
  id: z.string().min(1).max(100, 'Item ID must be 100 characters or less'), // Allow any string ID (UUID or fallback format)
  name: z.string().min(1).max(200, 'Item name must be 200 characters or less'),
  price: z.number().nonnegative().max(999999.99, 'Price must be less than $999,999.99').optional(),
  description: z.string().max(2000, 'Item description must be 2000 characters or less').optional(),
  image_url: z.string().url().max(2048, 'Image URL must be 2048 characters or less').optional(),
  category: zCategory.optional(),
})

// Sale draft payload schema (safe fields only - no secrets)
// Enterprise-ready: Includes size limits to prevent DoS and ensure scalability
export const SaleDraftPayloadSchema = z.object({
  // Form data (safe fields)
  formData: z.object({
    title: z.string().max(200, 'Title must be 200 characters or less').optional(),
    description: z.string().max(5000, 'Description must be 5000 characters or less').optional(),
    address: z.string().max(500, 'Address must be 500 characters or less').optional(),
    city: z.string().max(100, 'City must be 100 characters or less').optional(),
    state: z.string().max(50, 'State must be 50 characters or less').optional(),
    zip_code: z.string().max(10, 'Zip code must be 10 characters or less').optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    date_start: z.string().max(10, 'Date must be in YYYY-MM-DD format').optional(),
    time_start: z.string().max(5, 'Time must be in HH:MM format').optional(),
    date_end: z.string().max(10, 'Date must be in YYYY-MM-DD format').optional(),
    time_end: z.string().max(5, 'Time must be in HH:MM format').optional(),
    duration_hours: z.number().min(1).max(24).optional(),
    tags: z.array(z.string().max(50, 'Tag must be 50 characters or less')).max(20, 'Maximum 20 tags allowed').optional(),
    pricing_mode: z.enum(['negotiable', 'firm', 'best_offer', 'ask']).optional(),
  }),
  // Photos (image URLs only) - Limited to prevent abuse
  photos: z.array(z.string().url().max(2048, 'Photo URL must be 2048 characters or less')).max(20, 'Maximum 20 photos allowed').default([]),
  // Items - Limited to prevent abuse
  items: z.array(SaleDraftItemSchema).max(100, 'Maximum 100 items allowed').default([]),
  // Current step in wizard
  currentStep: z.number().int().min(0).max(4).default(0),
  // Promotion intent (user wants to feature the sale)
  wantsPromotion: z.boolean().default(false),
})

export type SaleDraftPayload = z.infer<typeof SaleDraftPayloadSchema>
export type SaleDraftItem = z.infer<typeof SaleDraftItemSchema>

