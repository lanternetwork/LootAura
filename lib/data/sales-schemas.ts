import { z } from 'zod'
import { Sale } from '@/lib/types'

// Individual sale schema
export const SaleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip_code: z.string(),
  lat: z.number(),
  lng: z.number(),
  date_start: z.string(),
  time_start: z.string().optional(),
  date_end: z.string().optional(),
  time_end: z.string().optional(),
  status: z.string(),
  privacy_mode: z.string().default('exact'),
  is_featured: z.boolean().default(false),
  created_at: z.string(),
  updated_at: z.string().optional(),
  owner_id: z.string().optional()
})

// Sales response schema
export const SalesResponseSchema = z.object({
  sales: z.array(SaleSchema),
  meta: z.object({
    total: z.number().optional(),
    parse: z.string().optional()
  }).optional()
})

// Type exports - use the existing Sale type from lib/types.ts
export type SalesResponse = z.infer<typeof SalesResponseSchema>

// Normalize function to handle various API response formats
export function normalizeSalesJson(json: any): any {
  // If json is already an array, wrap it in the expected format
  if (Array.isArray(json)) {
    return {
      sales: json,
      meta: { total: json.length }
    }
  }
  
  // If json has a sales property, use it
  if (json && typeof json === 'object' && 'sales' in json) {
    return json
  }
  
  // If json has a data property with sales, use it
  if (json && typeof json === 'object' && 'data' in json && Array.isArray(json.data)) {
    return {
      sales: json.data,
      meta: { total: json.data.length }
    }
  }
  
  // Default fallback
  return {
    sales: [],
    meta: { total: 0, parse: "failed" }
  }
}