export type SeoMetroGeographyRow = {
  slug: string
  city: string
  state: string
  timezone: string
  center_lat: number
  center_lng: number
  radius_miles: number
  inventory_limit: number
  qualified_override: boolean
  updated_at: string
}

export type MetroAssignmentSaleInput = {
  city?: string | null
  state?: string | null
  lat?: number | null
  lng?: number | null
}
