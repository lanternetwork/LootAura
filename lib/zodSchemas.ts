import { z } from 'zod'
import { CATEGORY_VALUES } from './data/categories'

export const SaleSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  tags: z.array(z.string()).default([]),
  price_min: z.number().optional(),
  price_max: z.number().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  contact: z.string().optional(),
  photos: z.array(z.string()).default([])
})

// Category enum schema - validates against shared category values
export const zCategory = z.enum(CATEGORY_VALUES as [string, ...string[]])

export const SaleItemSchema = z.object({
  name: z.string().min(1),
  category: zCategory.optional(),
  condition: z.string().optional(),
  price: z.number().optional(),
  photo: z.string().optional(),
  purchased: z.boolean().default(false)
})

export const ProfileSchema = z.object({
  display_name: z.string().optional(),
  avatar_url: z.string().optional()
})
