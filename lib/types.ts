export type Sale = {
  id: string
  owner_id: string
  title: string
  description?: string
  address?: string
  city: string
  state: string
  zip_code?: string
  lat?: number
  lng?: number
  date_start: string
  time_start: string
  date_end?: string
  time_end?: string
  price?: number
  tags?: string[]
  cover_image_url?: string | null
  images?: string[] | null
  archived_at?: string | null
  status: 'draft' | 'published' | 'archived' | 'active'
  privacy_mode: 'exact' | 'block_until_24h'
  is_featured: boolean
  pricing_mode?: 'negotiable' | 'firm' | 'best_offer' | 'ask'
  created_at: string
  updated_at: string
  // Computed properties added during API processing
  distance_m?: number
  distance_km?: number
}

// Public sale type for API responses (without owner_id for security)
export type PublicSale = Omit<Sale, 'owner_id'> & {
  // Computed from promotions table: true if sale has active promotion
  isFeatured?: boolean
}

export type SaleItem = {
  id: string
  sale_id: string
  name: string
  category?: string
  condition?: string
  price?: number
  photo?: string
  purchased: boolean
  created_at?: string
}

// Category type - must match values from lib/data/categories.ts
import { CATEGORY_VALUES } from './data/categories'
export type CategoryValue = (typeof CATEGORY_VALUES)[number]

export type Profile = {
  id: string
  display_name?: string
  avatar_url?: string
  bio?: string
  created_at?: string
  is_locked?: boolean
  lock_reason?: string | null
}

export type Favorite = {
  user_id: string
  sale_id: string
  created_at?: string
}

export type Marker = {
  id: string
  title: string
  lat: number
  lng: number
}

// Draft types
export type DraftStatus = 'active' | 'published' | 'archived'

// Import type for use in SaleDraft
import type { SaleDraftPayload as _SaleDraftPayload } from '@/lib/validation/saleDraft'

export type SaleDraft = {
  id: string
  user_id: string
  draft_key: string
  title?: string
  payload: _SaleDraftPayload
  status: DraftStatus
  created_at: string
  updated_at: string
  expires_at: string
}

// Re-export from validation schema
export type { SaleDraftPayload, SaleDraftItem } from '@/lib/validation/saleDraft'
