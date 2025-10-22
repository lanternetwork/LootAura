export type Sale = {
  id: string
  owner_id?: string
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
  status: 'draft' | 'published' | 'completed' | 'cancelled'
  privacy_mode: 'exact' | 'block_until_24h'
  is_featured: boolean
  created_at: string
  updated_at: string
  // Computed properties added during API processing
  distance_m?: number
  distance_km?: number
}

// Public sale type for API responses (without owner_id for security)
export type PublicSale = Omit<Sale, 'owner_id'>

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

export type Profile = {
  id: string
  display_name?: string
  avatar_url?: string
  bio?: string
  created_at?: string
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
