import { z } from 'zod'
import { zCategory } from '@/lib/zodSchemas'

// Draft status enum
export const DraftStatusSchema = z.enum(['active', 'published', 'archived'])
export type DraftStatus = z.infer<typeof DraftStatusSchema>

// Sale draft item schema (matches wizard item structure)
// Note: id can be UUID or fallback format (item-timestamp-random)
export const SaleDraftItemSchema = z.object({
  id: z.string().min(1), // Allow any string ID (UUID or fallback format)
  name: z.string().min(1),
  price: z.number().nonnegative().optional(),
  description: z.string().optional(),
  image_url: z.string().url().optional(),
  category: zCategory.optional(),
})

// Sale draft payload schema (safe fields only - no secrets)
export const SaleDraftPayloadSchema = z.object({
  // Form data (safe fields)
  formData: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip_code: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    date_start: z.string().optional(),
    time_start: z.string().optional(),
    date_end: z.string().optional(),
    time_end: z.string().optional(),
    duration_hours: z.number().min(1).max(24).optional(),
    tags: z.array(z.string()).optional(),
    pricing_mode: z.enum(['negotiable', 'firm', 'best_offer', 'ask']).optional(),
  }),
  // Photos (image URLs only)
  photos: z.array(z.string().url()).default([]),
  // Items
  items: z.array(SaleDraftItemSchema).default([]),
  // Current step in wizard
  currentStep: z.number().int().min(0).max(3).default(0),
  // Promotion intent (user wants to feature the sale)
  wantsPromotion: z.boolean().default(false),
})

export type SaleDraftPayload = z.infer<typeof SaleDraftPayloadSchema>
export type SaleDraftItem = z.infer<typeof SaleDraftItemSchema>

