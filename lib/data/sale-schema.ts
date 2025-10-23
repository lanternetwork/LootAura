import { z } from 'zod'

// Zod schema for Sale validation (client-safe)
export const SaleSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string(),
  state: z.string(),
  zip_code: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  date_start: z.string(),
  time_start: z.string(),
  date_end: z.string().optional(),
  time_end: z.string().optional(),
  price: z.number().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'completed', 'cancelled']),
  privacy_mode: z.enum(['exact', 'block_until_24h']),
  is_featured: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  distance_m: z.number().optional(),
  distance_km: z.number().optional()
})
